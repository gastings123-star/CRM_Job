import { render } from 'preact';
import { Shell } from './app/Shell';
import './ui/styles/global.css';

import { applyTheme, theme, readTheme } from './state/theme';
applyTheme(theme.value);
window.addEventListener('storage', () => applyTheme(readTheme()));

const root = document.getElementById('app');
if (!root) throw new Error('Root element #app not found');
render(<Shell />, root);
