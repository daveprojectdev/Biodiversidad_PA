// ============================================================
// Límite de consultas por persona (por minuto y por día) y un tope
// diario global, para no agotar la cuota gratis de Groq y Gemini.
//
// Un Durable Object por persona (su IP) y uno «global»: cada uno
// cuenta en serie, sin carreras, cosa que KV no garantiza. Reemplaza
// a rate_limit() de app_flask.py, que vivía en la memoria del proceso.
// ============================================================
import { DurableObject } from "cloudflare:workers";

interface Estado {
  minuto: number[]; // marcas de tiempo (ms) del último minuto
  dia: string; // YYYY-MM-DD en hora de Panamá
  usadosDia: number;
}

export interface Veredicto {
  permitido: boolean;
  motivo?: string;
  reintentarEnSegundos?: number;
}

function hoyEnPanama(ahora: number): string {
  // Panamá es UTC-5 todo el año (sin horario de verano).
  return new Date(ahora - 5 * 3600_000).toISOString().slice(0, 10);
}

export class LimiteDeConsultas extends DurableObject {
  async consumir(maxPorMinuto: number, maxPorDia: number): Promise<Veredicto> {
    const ahora = Date.now();
    const hoy = hoyEnPanama(ahora);
    const e: Estado = (await this.ctx.storage.get<Estado>("estado")) ?? { minuto: [], dia: hoy, usadosDia: 0 };
    if (e.dia !== hoy) {
      e.dia = hoy;
      e.usadosDia = 0;
    }
    e.minuto = e.minuto.filter((t) => ahora - t < 60_000);

    if (maxPorDia > 0 && e.usadosDia >= maxPorDia) {
      return { permitido: false, motivo: "dia" };
    }
    if (maxPorMinuto > 0 && e.minuto.length >= maxPorMinuto) {
      const espera = Math.ceil((60_000 - (ahora - e.minuto[0])) / 1000);
      return { permitido: false, motivo: "minuto", reintentarEnSegundos: espera };
    }
    e.minuto.push(ahora);
    e.usadosDia += 1;
    await this.ctx.storage.put("estado", e);
    return { permitido: true };
  }
}
