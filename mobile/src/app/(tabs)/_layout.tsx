import AppTabs from '@/components/app-tabs';

// The tab group. The native tab bar (index/sell/account) lives here so the
// root Stack can push full-screen routes (e.g. listing/[id]) over the tabs.
export default function TabsLayout() {
  return <AppTabs />;
}
