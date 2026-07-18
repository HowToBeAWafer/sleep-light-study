export function isTouchCapable(maxTouchPoints: number, coarsePointer: boolean) {
  return maxTouchPoints > 0 || coarsePointer;
}
