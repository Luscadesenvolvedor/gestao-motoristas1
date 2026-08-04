-- CreateTable
CREATE TABLE "importacoes_levt_motoristas" (
    "id"          TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "criadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importacoes_levt_motoristas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levt_motoristas" (
    "id"           TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "motorista"    TEXT NOT NULL,
    "veiculo"      TEXT,
    "valor"        DECIMAL(10,2) NOT NULL,
    "mes"          TEXT NOT NULL,
    "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "levt_motoristas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "levt_motoristas"
    ADD CONSTRAINT "levt_motoristas_importacaoId_fkey"
    FOREIGN KEY ("importacaoId")
    REFERENCES "importacoes_levt_motoristas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
