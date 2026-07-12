export type NotesStackParamList = {
  NotesList: undefined;
  Note: { id: string };
};

/**
 * Todos and Watch Later live UNDER Today rather than as tabs. Apple's HIG caps
 * a tab bar at five, and the floating pill physically can't hold seven without
 * shrinking every target below the 44pt minimum. Secondary sections push.
 */
export type TodayStackParamList = {
  TodayHome: undefined;
  Todos: undefined;
  Watch: undefined;
  Bytes: undefined;
};

export type TabParamList = {
  Today: undefined;
  NotesTab: undefined;
  Review: undefined;
  Journal: undefined;
  Settings: undefined;
};
