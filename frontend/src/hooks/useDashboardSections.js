import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function useDashboardSections(sections) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('section');

  const activeSection = useMemo(() => {
    const requested = String(requestedSection || '').trim();
    if (requested && sections.some((section) => section.key === requested)) {
      return requested;
    }

    return sections[0]?.key || 'overview';
  }, [requestedSection, sections]);

  useEffect(() => {
    if (requestedSection === activeSection) return;
    const nextParams = new URLSearchParams(searchParams);
    if (activeSection) {
      nextParams.set('section', activeSection);
    } else {
      nextParams.delete('section');
    }
    setSearchParams(nextParams, { replace: true });
  }, [activeSection, requestedSection, searchParams, setSearchParams]);

  const changeSection = (nextSection) => {
    const normalized = String(nextSection || '').trim();
    if (!normalized) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('section', normalized);
    setSearchParams(nextParams, { replace: true });
  };

  return {
    activeSection,
    changeSection,
  };
}
