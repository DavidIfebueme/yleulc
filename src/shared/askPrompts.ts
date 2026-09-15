export function promptForSmartMode(smartMode: boolean): string {
  return smartMode
    ? "Prioritize coding assistance. Explain the approach, edge cases, and implementation clearly."
    : ""
}
