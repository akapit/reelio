"use client";

// TODO: persist via PATCH /api/projects/[id] once the backend endpoint exists

import { MapPin } from "lucide-react";
import type { PropertyData } from "../property-detail";
import { Field } from "@/components/upload/Field";
import { useI18n } from "@/lib/i18n/client";

const propertyTypes = [
  "Apartment",
  "House",
  "Villa",
  "Penthouse",
  "Duplex",
  "Triplex",
  "Studio",
  "Cottage",
  "Lot",
  "Commercial",
];

const propertyFeaturesGroups: Record<string, string[]> = {
  "Property features": [
    "Balcony",
    "Parking",
    "Storage",
    "Safe room",
    "Air-conditioning",
    "Elevator",
    "Garden",
    "Pool",
    "Jacuzzi",
    "Sauna",
  ],
  "Accessibility & surroundings": [
    "Accessible",
    "Public transit",
    "Near schools",
    "Near shopping",
    "Quiet area",
    "Open view",
    "Near beach",
    "Near park",
  ],
  "Condition": [
    "Brand new",
    "Renovated",
    "Needs renovation",
    "Immediate availability",
    "Tenant-occupied",
    "Green building",
    "Natural light",
    "Grand entrance",
  ],
};

const groupLabelKeys = {
  "Property features": "propertyFeatures",
  "Accessibility & surroundings": "surroundings",
  Condition: "condition",
} as const;

interface InfoTabProps {
  data: PropertyData;
  onChange: (patch: Partial<PropertyData>) => void;
}

export function InfoTab({ data, onChange }: InfoTabProps) {
  const { t } = useI18n();
  const toggleFeature = (feature: string) => {
    const features = data.features.includes(feature)
      ? data.features.filter((f) => f !== feature)
      : [...data.features, feature];
    onChange({ features });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Address */}
      <section>
        <div
          className="serif"
          style={{
            fontSize: 20,
            letterSpacing: "-0.015em",
            color: "var(--fg-0)",
            marginBottom: 14,
          }}
        >
          {t.infoTab.address}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
          className="info-tab-grid-3"
        >
          <Field label={t.infoTab.street}>
            <input
              type="text"
              value={data.street}
              onChange={(e) => onChange({ street: e.target.value })}
              placeholder={t.infoTab.streetPlaceholder}
            />
          </Field>
          <Field label={t.infoTab.houseNumber}>
            <input
              type="text"
              value={data.streetNumber}
              onChange={(e) => onChange({ streetNumber: e.target.value })}
              placeholder={t.infoTab.houseNumber}
            />
          </Field>
          <Field label={t.infoTab.neighborhood}>
            <input
              type="text"
              value={data.neighborhood}
              onChange={(e) => onChange({ neighborhood: e.target.value })}
              placeholder={t.infoTab.neighborhood}
            />
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label={t.infoTab.city}>
              <input
                type="text"
                value={data.city}
                onChange={(e) => onChange({ city: e.target.value })}
                placeholder={t.infoTab.cityPlaceholder}
              />
            </Field>
          </div>
        </div>
      </section>

      {/* General details */}
      <section>
        <div
          className="serif"
          style={{
            fontSize: 20,
            letterSpacing: "-0.015em",
            color: "var(--fg-0)",
            marginBottom: 14,
          }}
        >
          {t.infoTab.generalDetails}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
          className="info-tab-grid-3"
        >
          <Field label={t.infoTab.propertyType}>
            <select
              value={data.propertyType}
              onChange={(e) => onChange({ propertyType: e.target.value })}
            >
              {propertyTypes.map((type) => (
                <option key={type} value={type}>
                  {t.infoTab.propertyTypes[type as keyof typeof t.infoTab.propertyTypes]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.infoTab.rooms}>
            <input
              type="text"
              value={data.rooms}
              onChange={(e) => onChange({ rooms: e.target.value })}
              placeholder={t.infoTab.roomsPlaceholder}
            />
          </Field>
          <Field label={t.infoTab.floor}>
            <input
              type="text"
              value={data.floor}
              onChange={(e) => onChange({ floor: e.target.value })}
              placeholder={t.infoTab.floor}
            />
          </Field>
          <Field label={t.infoTab.totalFloors}>
            <input
              type="text"
              value={data.totalFloors}
              onChange={(e) => onChange({ totalFloors: e.target.value })}
              placeholder={t.infoTab.totalFloors}
            />
          </Field>
          <Field label={t.infoTab.askingPrice}>
            <input
              type="text"
              value={data.price}
              onChange={(e) => onChange({ price: e.target.value })}
              placeholder="$"
            />
          </Field>
          <Field label={t.infoTab.size}>
            <input
              type="text"
              value={data.size}
              onChange={(e) => onChange({ size: e.target.value })}
              placeholder="m²"
            />
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label={t.infoTab.description}>
              <textarea
                value={data.description}
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder={t.infoTab.descriptionPlaceholder}
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "var(--bg-2)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 8,
                  outline: 0,
                  color: "var(--fg-0)",
                  fontSize: 13,
                  fontFamily: "inherit",
                  resize: "none",
                }}
              />
            </Field>
          </div>
        </div>
      </section>

      {/* Owner details */}
      <section>
        <div
          className="serif"
          style={{
            fontSize: 20,
            letterSpacing: "-0.015em",
            color: "var(--fg-0)",
            marginBottom: 14,
          }}
        >
          {t.infoTab.ownerDetails}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 12,
          }}
          className="info-tab-grid-2"
        >
          <Field label={t.infoTab.firstName}>
            <input
              type="text"
              value={data.ownerFirstName}
              onChange={(e) => onChange({ ownerFirstName: e.target.value })}
              placeholder={t.infoTab.firstName}
            />
          </Field>
          <Field label={t.infoTab.lastName}>
            <input
              type="text"
              value={data.ownerLastName}
              onChange={(e) => onChange({ ownerLastName: e.target.value })}
              placeholder={t.infoTab.lastName}
            />
          </Field>
          <Field label={t.infoTab.phone}>
            <input
              type="tel"
              value={data.ownerPhone}
              onChange={(e) => onChange({ ownerPhone: e.target.value })}
              placeholder="555-000-0000"
            />
          </Field>
          <Field label={t.infoTab.email}>
            <input
              type="email"
              value={data.ownerEmail}
              onChange={(e) => onChange({ ownerEmail: e.target.value })}
              placeholder="owner@example.com"
            />
          </Field>
        </div>
      </section>

      {/* Features */}
      <section>
        <div
          className="serif"
          style={{
            fontSize: 20,
            letterSpacing: "-0.015em",
            color: "var(--fg-0)",
            marginBottom: 14,
          }}
        >
          {t.infoTab.features}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {Object.entries(propertyFeaturesGroups).map(([groupName, features]) => (
            <div key={groupName}>
              <div className="kicker" style={{ marginBottom: 10 }}>
                {t.infoTab[groupLabelKeys[groupName as keyof typeof groupLabelKeys]]}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {features.map((feature) => {
                  const isActive = data.features.includes(feature);
                  return (
                    <button
                      key={feature}
                      type="button"
                      onClick={() => toggleFeature(feature)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 999,
                        fontSize: 12.5,
                        fontWeight: 500,
                        border: isActive
                          ? "1px solid var(--gold)"
                          : "1px solid var(--line-soft)",
                        background: isActive
                          ? "oklch(0.66 0.12 75 / 0.10)"
                          : "var(--bg-1)",
                        color: isActive
                          ? "var(--gold-hi)"
                          : "var(--fg-1)",
                        cursor: "pointer",
                        transition: "all .15s var(--ease)",
                      }}
                    >
                      {t.infoTab.featureNames[feature as keyof typeof t.infoTab.featureNames]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Map placeholder */}
      <section>
        <div
          className="serif"
          style={{
            fontSize: 20,
            letterSpacing: "-0.015em",
            color: "var(--fg-0)",
            marginBottom: 14,
          }}
        >
          {t.infoTab.map}
        </div>
        <div
          className="prop-img"
          data-tone="cool"
          style={{
            aspectRatio: "16 / 9",
            borderRadius: 12,
            border: "1px solid var(--line-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              textAlign: "center",
              color: "oklch(0.95 0.02 80 / 0.65)",
            }}
          >
            <MapPin
              size={32}
              style={{ margin: "0 auto 6px" }}
            />
            <div
              className="mono"
              style={{
                fontSize: 11.5,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              {t.infoTab.mapPreview}
            </div>
          </div>
        </div>
      </section>

      <style>{`
        .info-tab-grid-3 select,
        .info-tab-grid-3 input,
        .info-tab-grid-2 input {
          width: 100%;
          height: 34px;
          padding: 0 12px;
          background: var(--bg-2);
          border: 1px solid var(--line-soft);
          border-radius: 8px;
          outline: 0;
          color: var(--fg-0);
          font-size: 13px;
          transition: border-color .15s var(--ease), background .15s var(--ease);
          font-family: inherit;
        }
        .info-tab-grid-3 select:focus,
        .info-tab-grid-3 input:focus,
        .info-tab-grid-2 input:focus {
          border-color: oklch(0.66 0.12 75 / 0.5);
          background: var(--bg-1);
        }
        @media (max-width: 768px) {
          .info-tab-grid-3 { grid-template-columns: 1fr !important; }
          .info-tab-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
