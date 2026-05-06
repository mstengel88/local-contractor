export type ClassicColumnTable = "routes" | "sites" | "orders" | "unscheduled";
export type ClassicColumnSettings = Record<ClassicColumnTable, string[]>;

export const classicColumnOptions: Record<
  ClassicColumnTable,
  Array<{ key: string; label: string }>
> = {
  routes: [
    { key: "code", label: "Code" },
    { key: "driver", label: "Driver" },
    { key: "status", label: "Status" },
    { key: "weight", label: "Stops" },
    { key: "start", label: "Start" },
    { key: "finish", label: "Finish" },
    { key: "distance", label: "Distance" },
  ],
  sites: [
    { key: "stop", label: "#" },
    { key: "orderNo", label: "Order No" },
    { key: "customer", label: "Customer" },
    { key: "product", label: "Product" },
    { key: "quantity", label: "Qty" },
    { key: "unit", label: "Unit" },
    { key: "address", label: "Address" },
    { key: "requested", label: "Requested" },
    { key: "timePreference", label: "Time Preference" },
    { key: "arrived", label: "Arrived" },
    { key: "departed", label: "Departed" },
    { key: "eta", label: "ETA" },
    { key: "miles", label: "mi" },
  ],
  orders: [
    { key: "type", label: "Type" },
    { key: "orderNo", label: "Order No" },
    { key: "date", label: "Date" },
    { key: "client", label: "Client" },
    { key: "address", label: "Address" },
    { key: "weight", label: "Weight" },
    { key: "volume", label: "Volume" },
    { key: "status", label: "Status" },
    { key: "material", label: "Material" },
    { key: "timePreference", label: "Time Preference" },
    { key: "route", label: "Route" },
  ],
  unscheduled: [
    { key: "orderNo", label: "Order No" },
    { key: "date", label: "Date" },
    { key: "client", label: "Client" },
    { key: "address", label: "Address" },
    { key: "product", label: "Product" },
    { key: "weight", label: "Weight" },
    { key: "volume", label: "Volume" },
    { key: "timePreference", label: "Time Preference" },
    { key: "notes", label: "Notes" },
    { key: "route", label: "Route" },
  ],
};

export const defaultClassicColumnSettings: ClassicColumnSettings = {
  routes: ["code", "driver", "status", "weight", "start", "finish", "distance"],
  sites: ["stop", "orderNo", "address", "arrived", "departed", "eta", "miles"],
  orders: ["type", "orderNo", "date", "client", "weight", "volume", "status", "material"],
  unscheduled: ["orderNo", "date", "client", "address", "weight", "volume", "route"],
};
