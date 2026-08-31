function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function hostMatches(host: string, apex: string): boolean {
  return host === apex || host.endsWith(`.${apex}`);
}

export function isTwitterUrl(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  return hostMatches(host, 'x.com') || hostMatches(host, 'twitter.com');
}

export function isInstagramUrl(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  return hostMatches(host, 'instagram.com');
}
