// Sunfall City's constants: one place to tune the world's size, feel and palette.
export const CONFIG = {
  city: {
    blocks: 9,              // city is blocks x blocks of city blocks
    block: 74,              // metres across one block, roads included
    road: 14,               // road width between blocks
    sidewalk: 3,
    maxBuildingHeight: 64,
  },
  player: {
    walkSpeed: 6.2,
    runSpeed: 11,
    radius: 0.55,
    height: 1.75,
  },
  car: {
    accel: 17,
    brake: 30,
    topSpeed: 34,
    reverseSpeed: 9,
    steer: 2.1,
    grip: 5.5,
  },
  wanted: {
    decaySeconds: 14,       // seconds of clean living per wanted star
    crimePoints: { bumpPedestrian: 1, stealCar: 2, shootNear: 1, hitPedestrian: 3, hitCop: 4 },
  },
  colors: {
    sky: 0x1a1633,
    fog: 0x201a3e,
    ground: 0x23283a,
    road: 0x2e3444,
    sidewalk: 0x4a5164,
    line: 0xaeb8cc,
    sun: 0xbcc8ff,
    hemiSky: 0x5560a0,
    hemiGround: 0x2a2038,
    buildings: [0x3d4761, 0x465271, 0x51608a, 0x3a4258, 0x5c6b96, 0x4a4468],
    windowLit: 0xffd98a,
    cars: [0xef476f, 0x06d6a0, 0x118ab2, 0xffd166, 0xf78c6b, 0x8d99ae, 0xe0e4ea, 0x073b4c],
    police: 0x22335c,
    palm: 0x4f9c5e,
    trunk: 0x5d4a36,
  },
};
