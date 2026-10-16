// Reenvía esta ruta al Worker biodiversidad-api (service binding API).
// La petición viaja entera, con cf-connecting-ip, para el límite por persona.
export const onRequest = ({ request, env }) => env.API.fetch(request);
