const packed = globalThis.WORLDLENS_PACK || {};
const version = typeof document === 'undefined' ? '' : document.querySelector('meta[name="worldlens-version"]')?.content;
export function resource(path) {
  return packed.assets?.[path] ?? './' + path + (version ? '?v=' + encodeURIComponent(version) : '');
}
export async function dataFile(path) {
  if (packed.data?.[path]) return structuredClone(packed.data[path]);
  const response = await fetch(resource(path));
  if (!response.ok) throw new Error('无法读取观察框架或案例，请重新打开页面。');
  return response.json();
}
export const portable = !!packed.version;