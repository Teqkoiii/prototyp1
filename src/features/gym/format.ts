export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(value));
}

export function startOfLocalWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return start;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getWeeklyWorkoutCounts(workouts: Array<{ occurredAt: string }>, now = new Date()): number[] {
  const currentWeek = startOfLocalWeek(now);
  return Array.from({ length: 7 }, (_, index) => {
    const start = new Date(currentWeek);
    start.setDate(start.getDate() - (6 - index) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return workouts.filter((workout) => {
      const date = new Date(workout.occurredAt);
      return date >= start && date < end;
    }).length;
  });
}

export function getThisWeekWorkouts<T extends { occurredAt: string }>(workouts: T[], now = new Date()): T[] {
  const from = startOfLocalWeek(now);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return workouts.filter((workout) => {
    const date = new Date(workout.occurredAt);
    return date >= from && date < to;
  });
}

export function calculateWorkoutVolume(workouts: Array<{ exercises: Array<{ sets: Array<{ reps: number; weightKg: number }> }> }>): number {
  return workouts.reduce((workoutTotal, workout) => workoutTotal + workout.exercises.reduce(
    (exerciseTotal, exercise) => exerciseTotal + exercise.sets.reduce((setTotal, set) => setTotal + set.reps * set.weightKg, 0), 0,
  ), 0);
}
