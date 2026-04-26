"use client";

// TODO: persist via PATCH /api/projects/[id] once the backend endpoint exists

import { MapPin } from "lucide-react";
import type { PropertyData } from "../property-detail";

const propertyTypes = [
  "דירה",
  "בית פרטי",
  "וילה",
  "פנטהאוז",
  "דופלקס",
  "טריפלקס",
  "סטודיו",
  "קוטג'",
  "מגרש",
  "מסחרי",
];

const propertyFeaturesGroups: Record<string, string[]> = {
  "מאפייני הדירה": [
    "מרפסת",
    "חניה",
    "מחסן",
    "ממ\"ד",
    "מזגן",
    "מעלית",
    "גינה",
    "בריכה",
    "ג'קוזי",
    "סאונה",
  ],
  "נגישות וסביבה": [
    "נגיש לנכים",
    "קרוב לתחבורה ציבורית",
    "קרוב לבתי ספר",
    "קרוב למרכז מסחרי",
    "שקט",
    "נוף פתוח",
    "קרוב לים",
    "קרוב לפארק",
  ],
  "מצב הנכס": [
    "חדש מקבלן",
    "משופץ",
    "דורש שיפוץ",
    "פינוי מיידי",
    "מושכר",
    "בנייה ירוקה",
    "תאורה טבעית",
    "כניסה מרשימה",
  ],
};

const inputClass =
  "w-full px-4 py-2.5 bg-white border border-stone-300 rounded-lg focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200 text-right text-sm";
const labelClass = "text-sm text-slate-700 mb-2 block font-medium text-right";
const sectionHeaderClass =
  "text-sm font-semibold text-slate-900 mb-3 text-right";

interface InfoTabProps {
  data: PropertyData;
  onChange: (patch: Partial<PropertyData>) => void;
}

export function InfoTab({ data, onChange }: InfoTabProps) {
  const toggleFeature = (feature: string) => {
    const features = data.features.includes(feature)
      ? data.features.filter((f) => f !== feature)
      : [...data.features, feature];
    onChange({ features });
  };

  return (
    <div className="space-y-8" dir="rtl">
      {/* כתובת */}
      <section>
        <h3 className={sectionHeaderClass}>כתובת הנכס</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>רחוב</label>
            <input
              type="text"
              value={data.street}
              onChange={(e) => onChange({ street: e.target.value })}
              placeholder="שם הרחוב"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>מספר</label>
            <input
              type="text"
              value={data.streetNumber}
              onChange={(e) => onChange({ streetNumber: e.target.value })}
              placeholder="מספר בית"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>שכונה</label>
            <input
              type="text"
              value={data.neighborhood}
              onChange={(e) => onChange({ neighborhood: e.target.value })}
              placeholder="שכונה"
              className={inputClass}
            />
          </div>
          <div className="md:col-span-3">
            <label className={labelClass}>עיר</label>
            <input
              type="text"
              value={data.city}
              onChange={(e) => onChange({ city: e.target.value })}
              placeholder="שם העיר"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* פרטים כלליים */}
      <section>
        <h3 className={sectionHeaderClass}>פרטים כלליים</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>סוג הנכס</label>
            <select
              value={data.propertyType}
              onChange={(e) => onChange({ propertyType: e.target.value })}
              className={inputClass}
            >
              {propertyTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>חדרים</label>
            <input
              type="text"
              value={data.rooms}
              onChange={(e) => onChange({ rooms: e.target.value })}
              placeholder="מס' חדרים"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>קומה</label>
            <input
              type="text"
              value={data.floor}
              onChange={(e) => onChange({ floor: e.target.value })}
              placeholder="קומה"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>סה"כ קומות</label>
            <input
              type="text"
              value={data.totalFloors}
              onChange={(e) => onChange({ totalFloors: e.target.value })}
              placeholder="מס' קומות בבניין"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>מחיר</label>
            <input
              type="text"
              value={data.price}
              onChange={(e) => onChange({ price: e.target.value })}
              placeholder="₪"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>שטח (מ"ר)</label>
            <input
              type="text"
              value={data.size}
              onChange={(e) => onChange({ size: e.target.value })}
              placeholder="מ&quot;ר"
              className={inputClass}
            />
          </div>
          <div className="md:col-span-3">
            <label className={labelClass}>תיאור הנכס</label>
            <textarea
              value={data.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="תאר את הנכס..."
              rows={4}
              dir="rtl"
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>
      </section>

      {/* פרטי בעל הנכס */}
      <section>
        <h3 className={sectionHeaderClass}>פרטי בעל הנכס</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>שם פרטי</label>
            <input
              type="text"
              value={data.ownerFirstName}
              onChange={(e) => onChange({ ownerFirstName: e.target.value })}
              placeholder="שם פרטי"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>שם משפחה</label>
            <input
              type="text"
              value={data.ownerLastName}
              onChange={(e) => onChange({ ownerLastName: e.target.value })}
              placeholder="שם משפחה"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>טלפון</label>
            <input
              type="tel"
              value={data.ownerPhone}
              onChange={(e) => onChange({ ownerPhone: e.target.value })}
              placeholder="050-0000000"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>אימייל</label>
            <input
              type="email"
              value={data.ownerEmail}
              onChange={(e) => onChange({ ownerEmail: e.target.value })}
              placeholder="example@email.com"
              className={`${inputClass} text-left`}
            />
          </div>
        </div>
      </section>

      {/* תכונות הנכס */}
      <section>
        <h3 className={sectionHeaderClass}>תכונות הנכס</h3>
        <div className="space-y-6">
          {Object.entries(propertyFeaturesGroups).map(([groupName, features]) => (
            <div key={groupName}>
              <p className="text-xs font-medium text-slate-500 mb-3 text-right uppercase tracking-wide">
                {groupName}
              </p>
              <div className="flex flex-wrap gap-2 justify-end">
                {features.map((feature) => {
                  const isActive = data.features.includes(feature);
                  return (
                    <button
                      key={feature}
                      type="button"
                      onClick={() => toggleFeature(feature)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                        isActive
                          ? "bg-amber-50 border-amber-600 text-amber-900"
                          : "bg-white border-stone-300 text-slate-700 hover:border-amber-400 hover:bg-amber-50/50"
                      }`}
                    >
                      {feature}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* מפה — בתחתית בכל המסכים, כולל מובייל */}
      <section>
        <h3 className={sectionHeaderClass}>מפה</h3>
        <div className="aspect-video bg-gradient-to-br from-slate-100 to-stone-100 rounded-xl border border-stone-200 flex items-center justify-center">
          <div className="text-center">
            <MapPin className="w-10 h-10 text-stone-400 mx-auto mb-2" />
            <p className="text-sm text-stone-500">מפה תוצג כאן</p>
          </div>
        </div>
      </section>
    </div>
  );
}
