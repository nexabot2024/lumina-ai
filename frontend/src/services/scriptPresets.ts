export interface ScriptPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  duration: string;
  content: string;
  tags: string[];
}

export const SCRIPT_PRESETS: ScriptPreset[] = [
  {
    id: 'tutorial-001',
    name: 'Tutorial Tecnológico',
    category: 'Tutoriales',
    description: 'Estructura clásica para tutoriales tech step-by-step',
    duration: '3-5 min',
    content: `Introducción a [Tema]

Bienvenido a este tutorial sobre [Tema]. En este video te mostraré cómo dominar esta herramienta desde cero.

¿Por qué necesitas esto?

[Tema] es fundamental para [beneficio]. Con esta habilidad, podrás [resultado esperado] de manera mucho más eficiente.

Paso 1: [Primer paso]

Comencemos con lo básico. Primero, necesitas [acción inicial]. Esto es importante porque [explicación].

Paso 2: [Segundo paso]

Ahora que ya hemos cubierto lo básico, es momento de pasar al siguiente nivel. [Segundo paso] te permitirá [beneficio].

Paso 3: [Tercer paso]

Por último, vamos a [tercer paso]. Este paso es crucial para lograr los mejores resultados.

Conclusión

Acabas de aprender [resumen de lo aprendido]. Ahora puedes [aplicación práctica]. ¿Te gustaría aprender más? Suscríbete al canal y comparte tus resultados en los comentarios.`,
    tags: ['tutorial', 'educativo', 'paso-a-paso'],
  },
  {
    id: 'story-001',
    name: 'Storytelling Inspirador',
    category: 'Narrativa',
    description: 'Estructura narrativa para historias inspiradoras',
    duration: '2-4 min',
    content: `El Comienzo

Hace unos años, yo estaba donde tú. Sin esperanza, sin dirección, sin saber qué hacer con mi vida.

El Problema

Todos los días enfrentaba [problema]. Era frustrante, doloroso, y parecía que nada cambiaba. Probé diferentes caminos, pero nada funcionaba.

El Momento de Quiebre

Entonces, un día, algo cambió. Descubrí que [insight clave]. Fue como si alguien encendiera una luz en la oscuridad.

La Transformación

Desde ese momento, todo fue diferente. Comenzé a [acción]. Poco a poco, vi cómo [cambios positivos]. Era lento, pero consistente.

Lecciones Aprendidas

Durante este viaje, aprendí tres cosas fundamentales:

Primero, [lección 1]. Esto me enseñó que [reflexión].

Segundo, [lección 2]. Nunca hubiera llegado donde estoy sin entender esto.

Tercero, [lección 3]. Esta fue la clave que lo cambió todo.

Hoy

Hoy, soy [versión actual]. Todavía hay desafíos, pero ahora sé cómo enfrentarlos. Y lo más importante es que puedo ayudarte a ti a vivir la vida que deseas.

Llama a la Acción

Si tú también quieres cambiar, la pregunta no es "¿puedo?", sino "¿cuándo empiezo?". Empieza hoy. Únete a nosotros. Tu futuro yo te lo agradecerá.`,
    tags: ['narrativa', 'inspirador', 'motivación'],
  },
  {
    id: 'product-001',
    name: 'Lanzamiento de Producto',
    category: 'Marketing',
    description: 'Estructura para presentar un producto nuevo',
    duration: '1-2 min',
    content: `Problema

¿Alguna vez te has sentido [problema emocional]? Estamos seguros de que sí. Millones de personas lidian con esto diariamente.

Solución

Presentamos [Nombre del Producto]. La solución que finalmente resuelve [problema específico].

¿Cómo funciona?

[Nombre del Producto] utiliza [tecnología/método] para [beneficio principal]. Es simple, elegante y extraordinariamente efectivo.

Características Clave

✓ [Característica 1]: [Beneficio]
✓ [Característica 2]: [Beneficio]
✓ [Característica 3]: [Beneficio]
✓ [Característica 4]: [Beneficio]

Testimonio

"[Nombre del Producto] cambió completamente mi vida. Ahora puedo [resultado positivo] en solo [tiempo]. No podría estar más feliz." - [Nombre del Cliente]

Ofertas Especiales

Debido a que estamos celebrando el lanzamiento, te ofrecemos:

- 50% de descuento en el primer mes
- Acceso anticipado a nuevas características
- Soporte prioritario 24/7

Disponible Ahora

[Nombre del Producto] ya está disponible. Sé de los primeros en transformar tu [área de vida]. El enlace está en la descripción. ¡No esperes!`,
    tags: ['marketing', 'producto', 'venta'],
  },
  {
    id: 'vlog-001',
    name: 'Vlog Diario',
    category: 'Entretenimiento',
    description: 'Formato para vlogs casuales y entretenidos',
    duration: '5-15 min',
    content: `Hey, ¿Qué onda?

¿Qué tal, gente? Hoy te traigo otro episodio de [Nombre del Vlog]. Si es la primera vez que me ves, suscríbete porque subimos contenido increíble todas las semanas.

Lo que pasó hoy

Así que hoy fue una jornada bastante loca. Empezó cuando [evento 1]. No me lo esperaba, pero así es la vida, ¿verdad?

Luego, [evento 2]. Fue casi tan insólito como [comparación graciosa].

Lo más interesante

Pero lo realmente fascinante fue cuando [evento 3]. Me pasó algo que no había experimentado antes, y quería compartirlo contigo.

Aquí te muestro [lo que sucedió]. Como ves, [análisis/reflexión]. Es increíble cuántas cosas pasan cuando menos te lo esperas.

Mis reflexiones

Creo que esto demuestra que [lección/insight]. A veces necesitamos recordar que [verdad profunda].

¿Y tú qué piensas?

Me encantaría saber tu perspectiva. ¿Alguna vez te ha pasado algo similar? Déjamelo en los comentarios abajo.

Hasta el próximo episodio

Gracias por ver este video. Si te gustó, dale like, comparte con tus amigos y suscríbete para más contenido como este. Te veo en el próximo video. ¡Bye!`,
    tags: ['vlog', 'entretenimiento', 'casual'],
  },
  {
    id: 'review-001',
    name: 'Reseña de Producto',
    category: 'Reviews',
    description: 'Estructura completa para reseñar productos',
    duration: '4-8 min',
    content: `Introducción

Hoy vamos a revisar [Nombre del Producto]. He estado usando esto durante [tiempo], y tengo mucho que decirte al respecto.

Primera Impresión

Cuando lo desempaqué, lo primero que noté fue [observación inicial]. El diseño es [descripción]. Se siente [sensación] en las manos.

Especificaciones

Veamos los números:
- Dimensiones: [especificación]
- Peso: [especificación]
- Colores disponibles: [especificación]
- Precio: [especificación]

Rendimiento en la Práctica

Durante mis pruebas, [Nombre del Producto] demostró ser [evaluación]. Particularmente, me sorprendió [característica positiva 1]. Además, [característica positiva 2] es realmente útil.

Algunos aspectos a mejorar

No todo es perfecto. Notablemente, [desventaja 1] puede ser un problema para algunos usuarios. Además, [desventaja 2] es algo que hubiera preferido que fuera diferente.

¿Vale la pena?

En conclusión, [Nombre del Producto] es [evaluación final]. Si buscas [necesidad específica], definitivamente deberías considerarlo.

Veredicto Final

Rating: [puntuación]/10

Pros:
✓ [Pro 1]
✓ [Pro 2]
✓ [Pro 3]

Contras:
✗ [Contra 1]
✗ [Contra 2]

¿Quieres más?

¿Te gustaría que revise otros productos? Déjame saber en los comentarios. Y si encuentras útil este review, comparte el video. ¡Gracias!`,
    tags: ['review', 'análisis', 'producto'],
  },
  {
    id: 'education-001',
    name: 'Clase Educativa',
    category: 'Educación',
    description: 'Estructura para lecciones educativas en video',
    duration: '8-15 min',
    content: `Bienvenida a la Clase

Buenos días/tardes, estudiantes. Hoy vamos a explorar un tema fascinante: [Tema de la lección]. Este es el conocimiento que te abrirá las puertas a [oportunidad futura].

Contexto Histórico

Para entender [Tema], primero debemos retroceder a [período histórico]. En ese entonces, [contexto histórico]. Esto fue crucial porque [importancia].

Definición Clave

[Término] se define como [definición clara]. Es importante notar que [aclaración]. Un ejemplo sería [ejemplo concreto].

Concepto 1: [Nombre del Concepto]

[Concepto 1] es fundamental. Funciona de la siguiente manera:

Paso 1: [Explicación paso 1]
Paso 2: [Explicación paso 2]
Paso 3: [Explicación paso 3]

Visualicemos esto con un ejemplo: [Ejemplo práctico].

Concepto 2: [Nombre del Concepto]

Ahora pasemos a [Concepto 2]. Este se diferencia de [Concepto 1] en que [diferencia clave].

La fórmula es: [Fórmula o concepto]

Veamos cómo aplicar esto: [Aplicación práctica]

Problemas de Práctica

Ahora es tu turno. Intenta resolver esto:

Problema 1: [Problema]
Problema 2: [Problema]

Soluciones

Las respuestas son:

Problema 1: [Solución con explicación]
Problema 2: [Solución con explicación]

Conclusión y Resumen

Recapitulando lo que aprendimos hoy:

1. [Resumen punto 1]
2. [Resumen punto 2]
3. [Resumen punto 3]

Este conocimiento es la base para [clase futura].

Tarea

Para el próximo clase, quiero que:

1. [Tarea 1]
2. [Tarea 2]
3. [Tarea 3]

¿Preguntas?

Si algo no quedó claro, por favor levanta la mano... o déjame un comentario. Nos vemos en la próxima clase. ¡Excelente trabajo hoy!`,
    tags: ['educación', 'académico', 'lección'],
  },
];

export function getPresetById(id: string): ScriptPreset | undefined {
  return SCRIPT_PRESETS.find(p => p.id === id);
}

export function getPresetsByCategory(category: string): ScriptPreset[] {
  return SCRIPT_PRESETS.filter(p => p.category === category);
}

export function getCategories(): string[] {
  return Array.from(new Set(SCRIPT_PRESETS.map(p => p.category)));
}

export function searchPresets(query: string): ScriptPreset[] {
  const lowerQuery = query.toLowerCase();
  return SCRIPT_PRESETS.filter(
    p =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery) ||
      p.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}
