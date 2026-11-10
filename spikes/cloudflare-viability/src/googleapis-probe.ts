import { google } from 'googleapis';

export default {
  async fetch(): Promise<Response> {
    const oauthClient = new google.auth.OAuth2();
    const calendar = google.calendar({ version: 'v3', auth: oauthClient });
    const authorizationUrl = oauthClient.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar.app.created'],
    });
    const authorization = new URL(authorizationUrl);
    return Response.json({
      oauthClientCreated: oauthClient !== undefined,
      calendarClientCreated: calendar !== undefined,
      authorizationUrlGenerated:
        authorization.origin === 'https://accounts.google.com',
      offlineAccessRequested:
        authorization.searchParams.get('access_type') === 'offline',
      appCreatedCalendarScopeRequested: authorization.searchParams
        .get('scope')
        ?.includes('https://www.googleapis.com/auth/calendar.app.created'),
    });
  },
};
