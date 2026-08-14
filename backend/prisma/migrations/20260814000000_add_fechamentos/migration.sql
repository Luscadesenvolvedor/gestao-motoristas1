-- CreateTable
CREATE TABLE "fechamentos" (
    "id" TEXT NOT NULL,
    "empresa" TEXT NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFim" TIMESTAMP(3) NOT NULL,
    "arquivoNome" TEXT,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "fechamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fechamento_placas" (
    "id" TEXT NOT NULL,
    "fechamentoId" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "modelo" TEXT,
    "totalDespesas" DECIMAL(12,2) NOT NULL,
    "estimativaPerda" DECIMAL(12,2),

    CONSTRAINT "fechamento_placas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "fechamentos" ADD CONSTRAINT "fechamentos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fechamento_placas" ADD CONSTRAINT "fechamento_placas_fechamentoId_fkey" FOREIGN KEY ("fechamentoId") REFERENCES "fechamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
