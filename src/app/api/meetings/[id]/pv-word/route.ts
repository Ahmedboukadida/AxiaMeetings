import { NextRequest, NextResponse } from 'next/server';
import { MEETING_DURATION_LABELS_FR, isMeetingDuration } from '@/lib/durations';
import { prisma } from '@/lib/prisma';
import { requireRole, assertMeetingAccess, httpErrorResponse, toPositiveInt, type StaffActor } from '@/lib/authz';
import { sendPvLinks } from '@/lib/pv-notify';
import {
    Document, Packer, Paragraph, Table, TableRow, TableCell,
    TextRun, AlignmentType, BorderStyle, WidthType,
    ShadingType, Header, ImageRun, Footer,
    convertInchesToTwip,
} from 'docx';
import { saveUpload, deleteUpload, readLocalAsset, keyFromUrl } from '@/lib/storage';

// ─── Colour palette matching the PV HTML design ───────────────────────────────
const NAVY   = '002B5B';
const GRAY   = '94a3b8';
const EDGE   = 'e2e8f0';
const GREEN  = '15803d';
const RED    = 'b91c1c';
const WHITE  = 'FFFFFF';
const LGRAY  = 'f8fafc';

// ─── Text helpers ─────────────────────────────────────────────────────────────
const tx = (text: string, opts: Partial<{ bold: boolean; size: number; color: string; allCaps: boolean; italics: boolean }> = {}) =>
    new TextRun({ text, bold: opts.bold ?? false, size: opts.size ?? 20, color: opts.color ?? '334155', allCaps: opts.allCaps ?? false, italics: opts.italics ?? false });

const boldTx  = (text: string, size = 20, color = '1e293b') => tx(text, { bold: true, size, color });
const labelTx = (text: string)                              => tx(text, { bold: true, size: 18, color: GRAY, allCaps: true });

// No-border shorthand
const noB = () => ({ style: BorderStyle.NONE, size: 0, color: WHITE });

// ─── Section heading paragraph ────────────────────────────────────────────────
function sectionHeading(n: number, title: string): Paragraph {
    return new Paragraph({
        children: [tx(`${n}. ${title}`, { bold: true, size: 21, color: NAVY, allCaps: true })],
        spacing: { before: 240, after: 100 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: EDGE } },
    });
}

// ─── Key-value info row (borderless 2-col table row) ─────────────────────────
function infoRow(labelText: string, value: string): TableRow {
    return new TableRow({
        children: [
            new TableCell({
                width: { size: 28, type: WidthType.PERCENTAGE },
                borders: { top: noB(), bottom: noB(), left: noB(), right: noB() },
                children: [new Paragraph({ children: [labelTx(`${labelText}:`)] })],
            }),
            new TableCell({
                width: { size: 72, type: WidthType.PERCENTAGE },
                borders: { top: noB(), bottom: noB(), left: noB(), right: noB() },
                children: [new Paragraph({ children: [boldTx(value || '—')] })],
            }),
        ],
    });
}

// ─── Table cell for agenda/vote table ─────────────────────────────────────────
function agendaCell(text: string, opts: { color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; fill?: string } = {}): TableCell {
    const fill = opts.fill ?? WHITE;
    return new TableCell({
        shading: { fill, type: ShadingType.CLEAR, color: fill },
        children: [new Paragraph({
            children: [boldTx(text, 18, opts.color ?? '1e293b')],
            alignment: opts.align ?? AlignmentType.LEFT,
        })],
    });
}

// ─── Header cell (dark navy bg, white text) ───────────────────────────────────
function headerCell(text: string, widthPct: number): TableCell {
    return new TableCell({
        width: { size: widthPct, type: WidthType.PERCENTAGE },
        shading: { fill: NAVY, type: ShadingType.CLEAR, color: NAVY },
        children: [new Paragraph({
            children: [tx(text, { bold: true, size: 18, color: WHITE })],
            alignment: AlignmentType.CENTER,
        })],
    });
}

// ─── Helpers: labels ─────────────────────────────────────────────────────────
function durationLabel(d?: string) {
    if (!d) return '—';
    return isMeetingDuration(d) ? MEETING_DURATION_LABELS_FR[d] : d.replace(/_/g, ' ');
}
function modeLabel(m?: string) {
    const map: Record<string, string> = { IN_PERSON: 'Présentiel', ONLINE: 'En ligne (visioconférence)', HYBRID: 'Hybride' };
    return m ? (map[m] ?? m) : '—';
}
function typeLabel(t?: string) {
    const map: Record<string, string> = { ORDINAIRE: 'Assemblée Générale Ordinaire', EXTRAORDINAIRE: 'Assemblée Générale Extraordinaire', COMPLEMENTAIRE: 'Réunion Complémentaire', DELEGUES: 'Réunion des Délégués' };
    return t ? (map[t] ?? t) : '—';
}

// ─── Fetch logo as Buffer ─────────────────────────────────────────────────────
async function fetchLogoBuffer(logoUrl?: string | null): Promise<{ data: Buffer; type: 'png' | 'jpg' | 'gif' | 'bmp' | 'svg' } | null> {
    if (!logoUrl) return null;
    try {
        let buf: Buffer | null = null;
        if (logoUrl.startsWith('http')) {
            const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) return null;
            buf = Buffer.from(await res.arrayBuffer());
        } else {
            // Guarded read: UPLOAD_DIR / legacy public/uploads / public/ only (no traversal)
            buf = await readLocalAsset(logoUrl);
        }
        if (!buf) return null;
        // Detect type by magic bytes
        const isPng = buf[0] === 0x89 && buf[1] === 0x50;
        const isGif = buf[0] === 0x47 && buf[1] === 0x49;
        const type = isPng ? 'png' : isGif ? 'gif' : 'jpg';
        return { data: buf, type };
    } catch { return null; }
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let actor: StaffActor;
    let meetingId: number;
    try {
        actor = await requireRole(req, 'ADMIN', 'DEVELOPER');
        const { id } = await params;
        const parsed = toPositiveInt(id);
        if (!parsed) return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });
        meetingId = parsed;
        // Company scope (H1/N2): an ADMIN may only export/overwrite PVs of his own company's meetings.
        await assertMeetingAccess(actor, meetingId, 'manage');
    } catch (error) {
        const r = httpErrorResponse(error);
        if (r) return r;
        throw error;
    }

    try {
        const body = await req.json().catch(() => ({}));
        const overwrite = body.overwrite === true;

        // Fetch existing PVs for this meeting if any
        const existingPvs = await prisma.meetings_documents.findMany({
            where: {
                meeting_id: meetingId,
                file_title: { startsWith: 'PV Word —' }
            }
        });

        if (existingPvs.length > 0 && !overwrite) {
            return NextResponse.json({ 
                status: false, 
                message: 'EXISTING_PV', 
                count: existingPvs.length 
            });
        }

        if (overwrite && existingPvs.length > 0) {
            for (const pv of existingPvs) {
                // Only PV documents of THIS meeting (re-checked), files only inside UPLOAD_DIR.
                if (pv.meeting_id !== meetingId) continue;
                // Only unlink a file this route generated for THIS meeting; a document row pointing at
                // any other file (possibly another tenant's) only loses its row (N2).
                const key = keyFromUrl(pv.file_path);
                if (key && new RegExp(`^pvs/[^/]*pv-${meetingId}\\.docx$`).test(key)) {
                    await deleteUpload(pv.file_path);
                }
                await prisma.meetings_documents.deleteMany({ where: { id: pv.id, meeting_id: meetingId } });
            }
        }

        // Fetch meeting with all valid Prisma relations
        const meeting = await prisma.meetings.findUnique({
            where: { id: meetingId },
            include: {
                meetings_points: { include: { meetings_votes: true } },
                meetings_participants: {
                    include: {
                        meetings_invitations: {
                            where: { meeting_id: meetingId }
                        }
                    }
                },
                meetings_attendances: true,
                company: true,
            },
        });

        if (!meeting) return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });

        const company   = meeting.company;
        const points    = meeting.meetings_points ?? [];
        const total     = meeting.meetings_participants?.length ?? 0;
        const present   = meeting.meetings_attendances?.filter((a: any) => a.meetings_attendances_status === 'PRESENT').length ?? 0;
        const absent    = total - present;
        const refStr    = `PV-${meeting.id}/${new Date(meeting.date).getFullYear()}`;
        const dateStr   = new Date(meeting.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const dateShort = new Date(meeting.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

        // ── Logo ──────────────────────────────────────────────────────────────
        const logo = await fetchLogoBuffer(company?.logo_url);
        const logoChildren: (ImageRun | TextRun)[] = logo
            ? [new ImageRun({ data: logo.data, transformation: { width: 80, height: 40 }, type: logo.type } as any)]
            : [tx(company?.name?.substring(0, 2).toUpperCase() ?? 'AX', { bold: true, size: 36, color: NAVY })];

        // ── Document Header ───────────────────────────────────────────────────
        const docHeader = new Header({
            children: [
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    borders: { top: noB(), bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY }, left: noB(), right: noB() },
                    rows: [
                        new TableRow({
                            children: [
                                // Logo
                                new TableCell({
                                    width: { size: 20, type: WidthType.PERCENTAGE },
                                    borders: { top: noB(), bottom: noB(), left: noB(), right: noB() },
                                    children: [new Paragraph({ children: logoChildren, spacing: { after: 80 } })],
                                }),
                                // PV title
                                new TableCell({
                                    width: { size: 50, type: WidthType.PERCENTAGE },
                                    borders: { top: noB(), bottom: noB(), left: noB(), right: noB() },
                                    children: [
                                        new Paragraph({ children: [tx('PROCÈS-VERBAL', { bold: true, size: 28, color: NAVY, allCaps: true })], alignment: AlignmentType.CENTER }),
                                        new Paragraph({ children: [tx(typeLabel(meeting.type), { bold: true, size: 17, color: GRAY, allCaps: true })], alignment: AlignmentType.CENTER }),
                                    ],
                                }),
                                // Date + Ref
                                new TableCell({
                                    width: { size: 30, type: WidthType.PERCENTAGE },
                                    borders: { top: noB(), bottom: noB(), left: noB(), right: noB() },
                                    children: [
                                        new Paragraph({ children: [boldTx(dateShort.toUpperCase(), 19)], alignment: AlignmentType.RIGHT }),
                                        new Paragraph({ children: [tx(`Réf : ${refStr}`, { size: 16, color: GRAY })], alignment: AlignmentType.RIGHT }),
                                    ],
                                }),
                            ],
                        }),
                    ],
                }),
            ],
        });

        // ── Section 1: Info table ─────────────────────────────────────────────
        const infoRows: TableRow[] = [
            infoRow('Objet', meeting.subject),
            infoRow('Type de séance', typeLabel(meeting.type)),
            infoRow('Date', dateStr),
            infoRow('Heure', meeting.time),
            infoRow('Durée', durationLabel(meeting.duration)),
            infoRow('Mode', modeLabel(meeting.mode)),
            infoRow('Lieu', meeting.location || 'Non spécifié'),
        ];
        if (company?.name) infoRows.push(infoRow('Syndic / Société', company.name));
        if (company?.url)  infoRows.push(infoRow('Site web', company.url));

        const infoTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: noB(), bottom: noB(), left: noB(), right: noB() },
            rows: infoRows,
        });

        // ── Section 3: Agenda points table ───────────────────────────────────
        const agendaHeaderRow = new TableRow({
            tableHeader: true,
            children: [
                headerCell('#',                 6),
                headerCell('Point / Résolution', 54),
                headerCell('Type',              10),
                headerCell('Pour',              10),
                headerCell('Contre',            10),
                headerCell('Abs.',              10),
            ],
        });

        const agendaRows = points.map((point: any, idx: number) => {
            const isVote = point.type === 'VOTE';
            const votes  = point.meetings_votes ?? [];
            const oui    = votes.filter((v: any) => String(v.vote).toUpperCase() === 'OUI').length;
            const non    = votes.filter((v: any) => String(v.vote).toUpperCase() === 'NON').length;
            const neutre = votes.filter((v: any) => ['NEUTRE', 'ABS'].includes(String(v.vote).toUpperCase())).length;
            const fill   = idx % 2 === 0 ? WHITE : LGRAY;

            return new TableRow({
                children: [
                    agendaCell(String(idx + 1).padStart(2, '0'), { color: NAVY, align: AlignmentType.CENTER, fill }),
                    agendaCell(point.point,                       { fill }),
                    agendaCell(isVote ? 'VOTE' : 'INFO',          { color: isVote ? NAVY : GRAY, align: AlignmentType.CENTER, fill }),
                    agendaCell(isVote ? String(oui)    : '—',     { color: GREEN, align: AlignmentType.CENTER, fill }),
                    agendaCell(isVote ? String(non)    : '—',     { color: RED,   align: AlignmentType.CENTER, fill }),
                    agendaCell(isVote ? String(neutre) : '—',     { color: GRAY,  align: AlignmentType.CENTER, fill }),
                ],
            });
        });

        // ── Section 4: Attendance + Signature table ───────────────────────────
        const statsSignTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: { style: BorderStyle.SINGLE, size: 12, color: NAVY }, bottom: noB(), left: noB(), right: noB() },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            borders: { top: noB(), bottom: noB(), left: noB(), right: noB() },
                            children: [
                                new Paragraph({ children: [tx('Statistiques de présence', { bold: true, size: 18, color: NAVY, allCaps: true })], spacing: { after: 60 } }),
                                new Paragraph({ children: [labelTx('Total invités: '), boldTx(String(total), 19)] }),
                                new Paragraph({ children: [labelTx('Présents: '),      boldTx(String(present), 19, GREEN)] }),
                                new Paragraph({ children: [labelTx('Absents: '),       boldTx(String(absent),  19, RED)] }),
                            ],
                        }),
                        new TableCell({
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            borders: { top: noB(), bottom: noB(), left: noB(), right: noB() },
                            children: [
                                new Paragraph({ children: [tx('Signature & Cachet', { bold: true, size: 18, color: NAVY, allCaps: true })], alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
                                new Paragraph({ children: [tx('_'.repeat(40), { size: 20, color: EDGE })], alignment: AlignmentType.CENTER }),
                                new Paragraph({ children: [tx(' ', { size: 40 })] }),
                                new Paragraph({ children: [tx('Direction Générale', { bold: true, size: 18, color: NAVY, allCaps: true })], alignment: AlignmentType.CENTER }),
                            ],
                        }),
                    ],
                }),
            ],
        });

        // ── Footer ─────────────────────────────────────────────────────────────
        const footerParts: TextRun[] = [tx(`Réf. ${refStr}`, { size: 14, color: GRAY })];
        if (company?.url) footerParts.unshift(tx(`${company.url}   |   `, { size: 14, color: GRAY }));
        footerParts.push(tx('   |   Document généré par Axia Meetings IA', { size: 14, color: GRAY }));

        const docFooter = new Footer({
            children: [
                new Paragraph({
                    children: footerParts,
                    alignment: AlignmentType.CENTER,
                    border: { top: { style: BorderStyle.SINGLE, size: 4, color: EDGE } },
                    spacing: { before: 60 },
                }),
            ],
        });

        // ── Assemble document ──────────────────────────────────────────────────
        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        size: {
                            width:  convertInchesToTwip(8.27),   // A4 width
                            height: convertInchesToTwip(11.69),  // A4 height
                        },
                        margin: {
                            top:    convertInchesToTwip(0.6),
                            bottom: convertInchesToTwip(0.8),
                            left:   convertInchesToTwip(0.7),
                            right:  convertInchesToTwip(0.7),
                        },
                    },
                },
                headers: { default: docHeader },
                footers: { default: docFooter },
                children: [
                    new Paragraph({ text: '', spacing: { before: 80 } }),

                    // 1 – Informations générales
                    sectionHeading(1, 'Informations Générales'),
                    infoTable,

                    // 2 – Ordre du jour
                    sectionHeading(2, 'Ordre du Jour & Objectifs'),
                    new Paragraph({
                        children: [tx(meeting.description || 'Présenter les résultats, discuter des points stratégiques et adopter les résolutions nécessaires.', { size: 20 })],
                        alignment: AlignmentType.JUSTIFIED,
                        spacing: { after: 80 },
                    }),

                    // 3 – Points & résolutions
                    sectionHeading(3, "Points à l'Ordre du Jour & Résolutions"),
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: [agendaHeaderRow, ...agendaRows],
                    }),

                    new Paragraph({ text: '', spacing: { before: 240 } }),

                    // 4 – Tableau des présences
                    sectionHeading(4, 'Tableau des Présences & Invitations'),
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: [
                            new TableRow({
                                tableHeader: true,
                                children: [
                                    headerCell('Participant', 40),
                                    headerCell('Invitation', 30),
                                    headerCell('Présence', 30),
                                ],
                            }),
                            ...(meeting.meetings_participants || []).map((p: any, idx: number) => {
                                const invitation = p.meetings_invitations?.[0]?.status || 'PENDING';
                                const attendance = meeting.meetings_attendances?.find((a: any) => a.meetings_participant_id === p.id)?.meetings_attendances_status || 'ABSENT';
                                const fill = idx % 2 === 0 ? WHITE : LGRAY;

                                return new TableRow({
                                    children: [
                                        agendaCell(p.fullname || p.email, { fill }),
                                        agendaCell(
                                            invitation === 'ACCEPTED' ? 'Accepté' : invitation === 'REJECTED' ? 'Refusé' : 'En attente',
                                            { color: invitation === 'ACCEPTED' ? GREEN : invitation === 'REJECTED' ? RED : GRAY, align: AlignmentType.CENTER, fill }
                                        ),
                                        agendaCell(
                                            attendance === 'PRESENT' ? 'Présent' : 'Absent',
                                            { color: attendance === 'PRESENT' ? GREEN : RED, align: AlignmentType.CENTER, fill }
                                        ),
                                    ],
                                });
                            })
                        ],
                    }),

                    new Paragraph({ text: '', spacing: { before: 240 } }),

                    // 5 – Stats + Signature
                    sectionHeading(5, 'Validation & Clôture'),
                    statsSignTable,
                ],
            }],
        });

        // ── Save & register ────────────────────────────────────────────────────
        const { url: fileUrl, fileName } = await saveUpload('pvs', `pv-${meetingId}.docx`, await Packer.toBuffer(doc));

        const pvDoc = await prisma.meetings_documents.create({
            data: {
                meeting_id:  meetingId,
                file_title:  `PV Word — ${meeting.subject} (${new Date(meeting.date).toLocaleDateString('fr-FR')})`,
                file_path:   fileUrl,
            },
        });

        // Email each participant a personal PV link. Never fails the PV request.
        // Emails go out in the background so a slow SMTP server never makes the PV request time out
        // (a timeout would make the admin retry and create a second PV). Results are written to logs.
        void sendPvLinks(meetingId, { pvDocumentId: pvDoc.id, triggeredByUserId: actor.userId }).catch(() => undefined);
        const notified = { queued: true };

        return NextResponse.json({ status: true, data: { url: fileUrl, fileName, notified } });

    } catch (error: any) {
        console.error('PV Word export error:', error?.message || error);
        return NextResponse.json({ status: false, message: `Échec de la génération Word: ${error?.message ?? 'Erreur inconnue'}` }, { status: 500 });
    }
}
