import EditableList from './EditableList'

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">הגדרות</h1>

      <div className="space-y-4">
        <EditableList
          title="רשימת מתקינים"
          description='משמשת בשיוך מתקין להזמנה (במעבר "מוכנה" → "נאסף ע"י מתקין").'
          settingsKey="installers"
          placeholder="שם מתקין..."
        />

        <EditableList
          title="סוגי תפירה"
          description="רשימת הבחירה בשדה 'סוג תפירה' בטופס הזמנת וילון."
          settingsKey="sewing_types"
          placeholder="סוג תפירה חדש..."
        />

        <EditableList
          title="אמצעי תשלום"
          description="רשימת הבחירה בשדה 'סוג תשלום' בטופס ההזמנה."
          settingsKey="payment_methods"
          placeholder="אמצעי תשלום חדש..."
        />

        <EditableList
          title="סוג מוצר הצללה"
          description="רשימת הבחירה בשדה 'סוג פריט' בטופס הזמנת הצללה (זברה/ונציאני/רומי/גלילה...)."
          settingsKey="shading_subtypes"
          placeholder="סוג מוצר חדש..."
        />
      </div>
    </div>
  )
}
