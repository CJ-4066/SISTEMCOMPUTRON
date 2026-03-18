export default function DashboardSectionTabs({ sections, activeSection, onChange }) {
  return (
    <div className="page-tabs">
      {sections.map((section) => {
        const isActive = activeSection === section.key;
        const SectionIcon = section.icon;

        return (
          <button
            key={section.key}
            type="button"
            onClick={() => onChange(section.key)}
            className={`page-tab ${isActive ? 'page-tab-active' : ''}`}
          >
            <span className="flex items-center gap-2">
              {SectionIcon ? (
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                    isActive ? 'bg-white/20 text-white' : 'bg-primary-50 text-primary-600'
                  }`}
                >
                  <SectionIcon className="h-4 w-4" />
                </span>
              ) : null}
              <span>{section.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
