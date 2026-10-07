import { executeExternalApiAction } from '../externalApiEngine';

export async function sendPushSMS(companyId: number, title: string, content: string, participantExternalIds: number[], participantPhones: string[], meetingId: number, joinUrlMap: Record<number, string> = {}) {
    const promises = participantExternalIds.map((id, index) => 
        executeExternalApiAction({
            companyId,
            actionType: 'push_sms',
            payload: {
                title,
                body: content,
                identifiant_extern: id,
                phones: participantPhones[index], // Send the specific phone number
                meeting: meetingId,
                join_url: joinUrlMap[id] || ''
            }
        })
    );
    return Promise.allSettled(promises);
}
