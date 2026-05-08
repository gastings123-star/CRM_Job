import { render } from 'preact';
import { Shell } from './app/Shell';
import './ui/styles/global.css';

const root = document.getElementById('app');
if (!root) throw new Error('Root element #app not found');
render(<Shell />, root);
