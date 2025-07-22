export async function fetchSystemStatus() {
  const res = await fetch('/api/sysadmin/status');
  return await res.json();
}
export async function fetchModuleList() {
  const res = await fetch('/api/sysadmin/modules');
  return await res.json();
}
export async function fetchEvents() {
  const res = await fetch('/api/sysadmin/events');
  return await res.json();
}
export async function createModule(moduleName) {
  const res = await fetch('/api/sysadmin/create_module', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({name: moduleName})
  });
  return await res.json();
}
export async function deleteModule(moduleName) {
  const res = await fetch('/api/sysadmin/delete_module', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({name: moduleName})
  });
  return await res.json();
}

