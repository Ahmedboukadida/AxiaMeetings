import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { locales, defaultLocale } from './config';

export default getRequestConfig(async () => {
    const store = await cookies();
    let locale = store.get('locale')?.value || defaultLocale;

    // Ensure the locale is supported
    if (!locales.includes(locale as typeof locales[number])) {
        locale = defaultLocale;
    }

    const messages = (await import(`../messages/${locale}.json`)).default;

    return {
        locale,
        messages
    };
});