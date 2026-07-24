import './style.css';
import { createApp } from './app';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app mount point is missing from index.html');
createApp(root);
