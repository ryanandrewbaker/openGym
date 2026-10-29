/** LifePilot manage embed: routines-only Plan chrome (scheduling stays in Masis Planner). */
export function planPresentation(lpManage) {
  return {
    titleKey: lpManage ? 'Manage routines' : 'Plan',
    subtitleKey: lpManage ? 'Create and edit workout routines' : 'Your weekly routine',
    showScheduling: !lpManage,
    showSharePlan: !lpManage,
  }
}
