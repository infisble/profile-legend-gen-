import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './App.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element #root was not found.');
}

ReactDOM.createRoot(root).render(<App />);
