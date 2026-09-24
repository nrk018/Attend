-- Allow ID-card embeddings alongside front/left/right.
ALTER TABLE face_embeddings DROP CONSTRAINT IF EXISTS face_embeddings_pose_check;
ALTER TABLE face_embeddings ADD CONSTRAINT face_embeddings_pose_check
  CHECK (pose IN ('front', 'left', 'right', 'id_card'));
