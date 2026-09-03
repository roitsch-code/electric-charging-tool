export {
  VEHICLE,
  WLTP_KM_PER_KWH,
  REAL_WORLD_KM_PER_KWH,
  DC_AVG_KW_TO_80,
} from "./profile";
export type { VehicleProfile } from "./profile";
export {
  demandClass,
  minUsefulDcKw,
  usableDcPowerKw,
  usableAcPowerKw,
  estimateChargeKwh,
  estimateAddedRangeKm,
} from "./charging";
export type { Connector, DemandClass } from "./charging";
