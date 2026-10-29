import assert from 'node:assert/strict';
import { clampBattery, batteryFromDistance, adjustBatteryValue } from './battery.js';

assert.equal(clampBattery(120), 100);
assert.equal(clampBattery(-5), 0);
assert.equal(clampBattery(52), 52);
assert.equal(batteryFromDistance(80, 10), 40);
assert.equal(adjustBatteryValue(30, 10), 40);
assert.equal(adjustBatteryValue(95, 20), 100);

console.log('battery logic ok');
