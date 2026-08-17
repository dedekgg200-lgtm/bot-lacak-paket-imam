def ambil_nomor_hp(data):

    nomor_ditemukan = []

    def cari_nomor(obj):

        if isinstance(obj, dict):

            for key, value in obj.items():

                nama_key = str(key).lower()

                # Cari field yang berkaitan dengan nomor telepon
                if any(k in nama_key for k in [
                    "phone",
                    "mobile",
                    "tel",
                    "telephone",
                    "receiver_phone",
                    "phone_number"
                ]):

                    if value is not None:
                        teks = str(value).strip()

                        if re.search(r"\d{7,}", teks):
                            nomor_ditemukan.append(teks)

                # Cari lagi di dalam dictionary
                cari_nomor(value)

        elif isinstance(obj, list):

            for item in obj:
                cari_nomor(item)

    cari_nomor(data)

    # Hilangkan duplikat
    hasil = []

    for nomor in nomor_ditemukan:

        if nomor not in hasil:
            hasil.append(nomor)

    if not hasil:
        return "Tidak tersedia"

    # Ambil nomor pertama yang benar-benar diberikan API
    nomor = hasil[0]

    # Hanya angka
    angka = re.sub(r"[^0-9]", "", nomor)

    if len(angka) <= 6:
        return angka

    # Contoh:
    # 081234567890
    # menjadi:
    # 0812******90

    return (
        angka[:4]
        + ("*" * (len(angka) - 6))
        + angka[-2:]
    )
