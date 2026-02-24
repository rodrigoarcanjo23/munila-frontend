import axios from 'axios';

export const api = axios.create({
  baseURL: 'https://munila-backend.onrender.com' // <-- O seu link oficial da nuvem!
});