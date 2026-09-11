import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

// Projects
export async function listProjects() {
  const { data } = await api.get('/projects');
  return data;
}
export async function createProject(name) {
  const { data } = await api.post('/projects', { name });
  return data;
}
export async function getProject(id) {
  const { data } = await api.get(`/projects/${id}`);
  return data;
}
export async function updateProject(id, payload) {
  const { data } = await api.patch(`/projects/${id}`, payload);
  return data;
}
export async function deleteProject(id) {
  const { data } = await api.delete(`/projects/${id}`);
  return data;
}

// Templates
export async function validateTemplate(template_data) {
  const { data } = await api.post('/templates/validate', { template_data });
  return data;
}
