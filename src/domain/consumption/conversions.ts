import type { EnergyUnit } from '../../types';

export const energyToMwh = (value: number, unit: EnergyUnit): number =>
  unit === 'kWh' ? value / 1000 : value;

export const energyFromMwh = (value: number, unit: EnergyUnit): number =>
  unit === 'kWh' ? value * 1000 : value;

export const priceToTlMwh = (value: number, unit: EnergyUnit): number =>
  unit === 'kWh' ? value * 1000 : value;

export const priceFromTlMwh = (value: number, unit: EnergyUnit): number =>
  unit === 'kWh' ? value / 1000 : value;
