export function getAppRoot() {
  if (process.env.KOZHEVNYA_ROOT) {
    return process.env.KOZHEVNYA_ROOT;
  }
  return process.cwd();
}
