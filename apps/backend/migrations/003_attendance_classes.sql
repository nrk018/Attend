-- Migration: Class-based attendance (periods)
-- Run this in your Supabase SQL Editor if it is not applied automatically.

CREATE TABLE IF NOT EXISTS attendance_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
  class_date DATE NOT NULL,
  name VARCHAR(100) NOT NULL DEFAULT 'Period 1',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_classes_lookup
  ON attendance_classes(subject_id, section_id, class_date);

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES attendance_classes(id) ON DELETE CASCADE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'face';

CREATE INDEX IF NOT EXISTS idx_attendance_class_id ON attendance(class_id);

-- Backfill one Period 1 class per subject + section + date
INSERT INTO attendance_classes (subject_id, section_id, class_date, name, created_at)
SELECT
  a.subject_id,
  a.section_id,
  a.attendance_date,
  'Period 1',
  MIN(a.timestamp)
FROM attendance a
WHERE a.class_id IS NULL
GROUP BY a.subject_id, a.section_id, a.attendance_date;

UPDATE attendance a
SET class_id = c.id
FROM attendance_classes c
WHERE a.class_id IS NULL
  AND a.subject_id = c.subject_id
  AND a.attendance_date = c.class_date
  AND a.section_id IS NOT DISTINCT FROM c.section_id;

ALTER TABLE attendance DROP CONSTRAINT IF EXISTS unique_student_subject_date;

CREATE UNIQUE INDEX IF NOT EXISTS unique_class_student
  ON attendance(class_id, student_id)
  WHERE class_id IS NOT NULL;

ALTER TABLE attendance_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view attendance_classes" ON attendance_classes;
CREATE POLICY "Users can view attendance_classes" ON attendance_classes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Teachers and admins can manage attendance_classes" ON attendance_classes;
CREATE POLICY "Teachers and admins can manage attendance_classes" ON attendance_classes
  FOR ALL USING (true);

NOTIFY pgrst, 'reload schema';

