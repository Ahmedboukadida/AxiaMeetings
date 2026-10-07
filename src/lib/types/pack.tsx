export interface Pack {
    id: number;
    name: string;
    price_month: number;
    price_year: number;
}

export interface PackLine {
    id: number;
    pack_id: number;
    title: string;
    pack?: Pack;
}

export interface PacksFull {
    id: number;
    name: string;
    price_month: number;
    price_year: number;
    packs_lines: PackLine[];
}
