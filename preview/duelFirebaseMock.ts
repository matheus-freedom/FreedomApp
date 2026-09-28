// Firebase falso para o preview dos duelos: o "token" é o próprio uid.
const uid = new URLSearchParams(location.search).get('as') || 'me';
export const auth: any = { currentUser: { getIdToken: async () => uid } };
export const db: any = {};
export const storage: any = {};
