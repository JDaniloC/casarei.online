-- Adicionar coluna de cotas totais aos presentes
-- total_quotas = NULL significa presente normal (sem divisão em cotas)
-- Quando definido, stock representará as cotas restantes
ALTER TABLE public.gifts
ADD COLUMN total_quotas INTEGER DEFAULT NULL;
