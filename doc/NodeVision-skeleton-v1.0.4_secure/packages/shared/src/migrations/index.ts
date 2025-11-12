// Schema migrations scaffold
export type Project = { schemaVersion: string; [k: string]: any };

export function migrate(project: Project): { project: Project; migrated: boolean; errors?: string[] } {
  const from = project.schemaVersion || '1.0.0';
  if (from === '1.0.5') {
    const out = { ...project, schemaVersion: '1.0.6' };
    return { project: out, migrated: true };
  }
  return { project, migrated: false };
}
