from typing import Optional
import socket
import threading
import time

import httpx
from supabase import Client, create_client
from supabase.lib.client_options import ClientOptions

from app.config import get_settings


class _IPv4Transport(httpx.HTTPTransport):
    """Resolve and connect over IPv4 only. IPv6 to Supabase times out on this network."""

    def handle_request(self, request):
        original = socket.getaddrinfo

        def ipv4_only(host, port, family=0, type=0, proto=0, flags=0):
            return original(host, port, socket.AF_INET, type, proto, flags)

        socket.getaddrinfo = ipv4_only  # type: ignore[method-assign]
        try:
            return super().handle_request(request)
        finally:
            socket.getaddrinfo = original  # type: ignore[method-assign]

_settings = get_settings()
_lock = threading.Lock()
_client: Optional[Client] = None
_client_created_at = 0.0
_CLIENT_MAX_AGE_SEC = 30.0


def _close_client(client: Optional[Client]) -> None:
    if client is None:
        return
    try:
        session = getattr(client.postgrest, "session", None)
        if session is not None:
            session.close()
    except Exception:
        pass


def _make_client() -> Client:
    timeout = httpx.Timeout(20.0, connect=8.0)
    # Keep-alive sockets to Supabase/Kong go stale and then 404 as
    # "Route GET:/departments not found". Do not reuse connections.
    http_client = httpx.Client(
        timeout=timeout,
        http2=False,
        transport=_IPv4Transport(retries=1),
        limits=httpx.Limits(max_keepalive_connections=0, max_connections=20),
    )
    return create_client(
        _settings.supabase_url,
        _settings.supabase_service_key,
        options=ClientOptions(
            httpx_client=http_client,
            postgrest_client_timeout=timeout,
            persist_session=False,
            auto_refresh_token=False,
        ),
    )


def reset_supabase() -> None:
    global _client, _client_created_at
    with _lock:
        _close_client(_client)
        _client = None
        _client_created_at = 0.0


def get_supabase() -> Client:
    """Service-role client. Recreate often so stale keep-alives cannot hang or 404."""
    global _client, _client_created_at
    now = time.monotonic()
    with _lock:
        if _client is None or (now - _client_created_at) > _CLIENT_MAX_AGE_SEC:
            _close_client(_client)
            _client = _make_client()
            _client_created_at = now
        return _client
