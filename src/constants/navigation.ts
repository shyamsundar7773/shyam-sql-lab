export type NavigationItem = {
  label: string;
  href: string;
  icon: 'home' | 'learning' | 'notes' | 'practice' | 'projects' | 'interview' | 'progress' | 'profile' | 'addNotes';
};

export const navigationItems: NavigationItem[] = [
  { label: 'Dashboard', href: '/', icon: 'home' },
  { label: 'Learning Path', href: '/learning-path', icon: 'learning' },
  { label: 'Notes', href: '/notes', icon: 'notes' },
  { label: 'My Practiced Notes', href: '/my-practiced-notes', icon: 'notes' },
  { label: 'SQL Practice', href: '/sql-practice', icon: 'practice' },
  { label: 'SQL Practiced Notes', href: '/sql-practiced-notes', icon: 'notes' },
  { label: 'Projects', href: '/projects', icon: 'projects' },
  { label: 'Interview Room', href: '/interview-room', icon: 'interview' },
  { label: 'Add Notes', href: '/add-notes', icon: 'addNotes' },
  { label: 'Progress', href: '/progress', icon: 'progress' },
  { label: 'Profile / Settings', href: '/profile', icon: 'profile' },
];
