// Fixed inputs for the P1 hybrid spikes (also reused by later eval work).
import customerPhotoUrl from '../../../../content/samples/customer-photo-led.jpg?url';

export { customerPhotoUrl };

export const SAMPLE_JOB = {
  id: 'J-1042',
  customer: 'Demo customer (Etobicoke, ON)',
  equipment: 'Goodman GMVC96 gas furnace, installed 2016',
  reported: 'No heat since this morning. Red light inside the furnace blinks 3 times, pauses, repeats.',
  outdoorTemp: '-6 °C',
  notes: 'Infant at home. Customer available all day.',
};

export const DIAGNOSIS_CASE = {
  step_instruction: 'Check that the inducer motor runs on a call for heat.',
  allowed: ['runs', 'does not run', 'runs noisy'],
  history: 'Thermostat calling for heat (W energized). Status LED: 3 flashes.',
  note: "turned the stat up, the little fan motor on top isn't spinning at all, no hum either",
  expected: 'does not run',
};

export const TRIAGE_MESSAGE =
  'Furnace stopped heating overnight. The red light inside the little window blinks 3 times, then pauses. Photo attached.';
