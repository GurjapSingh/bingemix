'use client';

import { useState } from 'react';
import SearchPanel from './SearchPanel';
import PreviewPanel from './PreviewPanel';

export default function ClientArea() {
    const [selected, setSelected] = useState([]);

    return (
        <section className="space-y-6">
            <SearchPanel selected={selected} onChangeSelected={setSelected} />
            <PreviewPanel selected={selected} />
        </section>
    );
}
