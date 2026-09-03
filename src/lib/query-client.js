import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			// Reuse cached lists across navigations instead of refetching the
			// 500-row points/spaces queries on every page mount.
			staleTime: 5 * 60 * 1000,
			// Long gcTime so the persisted cache survives reloads and powers
			// offline reads (must be >= the persister maxAge).
			gcTime: 24 * 60 * 60 * 1000,
		},
	},
});
