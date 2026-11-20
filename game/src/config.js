// Sunfall City — every tunable number and colour in one place.
export const CONFIG = {
  city: { blocks: 9, block: 74, road: 14 },
  player: { walkSpeed: 6.2, runSpeed: 11, radius: 0.55 },
  car: { accel: 17, brake: 30, topSpeed: 34, reverseSpeed: 9, steer: 2.1 },
  wanted: {
    decaySeconds: 14,
    crimePoints: { stealCar: 2, shootNear: 1, hitPedestrian: 3, bumpPedestrian: 1 },
  },
  colors: {
    sky: 0x1a1633,
    fog: 0x201a3e,
    road: 0x2e3444,
    sidewalk: 0x4a5164,
    buildings: [0x1c1f3f, 0x232750, 0x191d3a, 0x2b2f5c, 0x211c46, 0x181a30],
    windowLit: 0xffd98a,
    cars: [0xef476f, 0x06d6a0, 0x118ab2, 0xffd166, 0xf78c6b, 0x8d99ae, 0xe0e4ea, 0x073b4c],
    police: 0x22335c,
    palm: 0x4f9c5e,
    trunk: 0x5d4a36,
  },
};
