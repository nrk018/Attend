-- Roster-first student enrollment: Super Admin adds details; portal/device adds faces.

ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ;
ALTER TABLE students ADD COLUMN IF NOT EXISTS enrollment_status TEXT DEFAULT 'provisioned';
ALTER TABLE students ADD COLUMN IF NOT EXISTS id_card_url TEXT;

UPDATE students
SET enrollment_status = 'enrolled'
WHERE primary_image_url IS NOT NULL
  AND (enrollment_status IS NULL OR enrollment_status = 'provisioned');

CREATE UNIQUE INDEX IF NOT EXISTS students_college_reg_no_uidx
  ON students (college_id, reg_no);

CREATE UNIQUE INDEX IF NOT EXISTS students_college_email_uidx
  ON students (college_id, lower(email))
  WHERE email IS NOT NULL;
