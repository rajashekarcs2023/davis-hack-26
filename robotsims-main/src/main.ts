import './style.css';
import { SimulatorApp } from './simulator/simulator-app';

const app = new SimulatorApp();

app.init().catch((error) => {
  console.error('Failed to initialize RobotSim', error);
});
