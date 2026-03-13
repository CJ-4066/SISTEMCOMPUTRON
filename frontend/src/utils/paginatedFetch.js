import api from '../services/api';

const MAX_SAFE_PAGE_SIZE = 100;

export const fetchAllPages = async ({
  path,
  params = {},
  pageSize = MAX_SAFE_PAGE_SIZE,
  maxPages = 1000,
}) => {
  const boundedPageSize = Math.min(MAX_SAFE_PAGE_SIZE, Math.max(1, Number(pageSize) || MAX_SAFE_PAGE_SIZE));
  const collected = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= maxPages) {
    const response = await api.get(path, {
      params: {
        ...params,
        page,
        page_size: boundedPageSize,
      },
    });

    const items = response.data?.items || [];
    const meta = response.data?.meta || {};
    const reportedTotalPages = Number(meta.total_pages || 0);

    collected.push(...items);

    if (reportedTotalPages > 0) {
      totalPages = reportedTotalPages;
    } else if (items.length < boundedPageSize) {
      totalPages = page;
    } else {
      totalPages = page + 1;
    }

    page += 1;
  }

  return collected;
};
