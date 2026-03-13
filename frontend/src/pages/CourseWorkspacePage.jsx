import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import TeacherCourseWorkspacePage from './TeacherCourseWorkspacePage';
import StudentCourseWorkspacePage from './StudentCourseWorkspacePage';

export default function CourseWorkspacePage() {
  const { user } = useAuth();
  const roles = useMemo(() => user?.roles || [], [user]);
  const isAlumnoProfile = roles.length === 1 && roles.includes('ALUMNO');

  if (isAlumnoProfile) {
    return <StudentCourseWorkspacePage />;
  }

  return <TeacherCourseWorkspacePage />;
}
