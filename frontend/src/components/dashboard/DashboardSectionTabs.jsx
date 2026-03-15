export default function DashboardSectionTabs({ sections, activeSection, onChange }) {
  return (
    <div className="page-tabs">
      {sections.map((section) => (
        <button
          key={section.key}
          type="button"
          onClick={() => onChange(section.key)}
          className={`page-tab ${activeSection === section.key ? 'page-tab-active' : ''}`}
        >
          {section.label}
        </button>
      ))}
    </div>
  );
}
