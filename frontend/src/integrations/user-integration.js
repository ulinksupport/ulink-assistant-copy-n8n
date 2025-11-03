import { API_BASE, GET_LIST_USERS, POST_CREATE_USER } from "../config";

/**
 * Create user (existing)
 */
export async function postNewUser(payload) {
  const response = await fetch(API_BASE + POST_CREATE_USER, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseData = await response.json();
  return responseData;
}

/**
 * List users (existing)
 */
export async function getListOfUsers() {
    const response = await fetch(API_BASE + GET_LIST_USERS, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
    });

    const responseData = await response.json();
    return responseData;
}

/**
 * Delete user by id
 * Accepts optional token; if not provided, will try to read from localStorage.
 */
export async function deleteUserById(userId, token) {
  const t = token || (typeof window !== 'undefined' && localStorage.getItem('ulink.auth.token'));
  const response = await fetch(`${API_BASE}/api/users/${userId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {})
    }
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
  return data;
}

/**
 * Update user by id (PUT)
 * payload: { username, assistantIds: [], password? }
 */
export async function updateUserById(userId, payload, token) {
  const t = token || (typeof window !== 'undefined' && localStorage.getItem('ulink.auth.token'));
  const response = await fetch(`${API_BASE}/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {})
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
  return data;
}
