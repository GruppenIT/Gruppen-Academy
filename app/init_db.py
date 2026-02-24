"""Startup script: create tables and seed initial data."""

import asyncio
import logging
import secrets

from sqlalchemy import select, text

from app.auth.utils import get_password_hash
from app.config import settings
from app.database import Base, engine, async_session
from app.users.models import User, UserRole

# Import all models so Base.metadata knows about them
from app.audit.models import AuditLog  # noqa: F401
from app.catalog.models import Competency, MasterGuideline, Product  # noqa: F401
from app.evaluations.models import AnalyticalReport, Evaluation  # noqa: F401
from app.gamification.models import Badge, Score, UserBadge  # noqa: F401
from app.journeys.models import Journey, JourneyParticipation, OCRUpload, Question, QuestionResponse  # noqa: F401
from app.learning.models import ActivityCompletion, LearningActivity, LearningPath, TutorSession  # noqa: F401
from app.teams.models import Team  # noqa: F401
from app.trainings.models import Training, TrainingModule, ModuleQuiz, QuizQuestion, TrainingEnrollment, ModuleProgress, QuizAttempt, TrainingQuiz, TrainingQuizQuestion, TrainingQuizAttempt  # noqa: F401

logger = logging.getLogger(__name__)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Inline migrations for columns added after initial schema
    async with engine.begin() as conn:
        await conn.execute(text(
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0"
        ))
        await conn.execute(text(
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS technology TEXT"
        ))
        await conn.execute(text(
            "ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_provider VARCHAR(50)"
        ))
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_sub VARCHAR(255)"
        ))
        # Fix journeymode enum values: migration 005 created them lowercase
        # but SQLAlchemy Enum() uses Python enum member NAMES (uppercase) by default.
        await conn.execute(text("""
            DO $$ BEGIN ALTER TYPE journeymode RENAME VALUE 'sync' TO 'SYNC';
            EXCEPTION WHEN others THEN NULL; END $$"""))
        await conn.execute(text("""
            DO $$ BEGIN ALTER TYPE journeymode RENAME VALUE 'async' TO 'ASYNC';
            EXCEPTION WHEN others THEN NULL; END $$"""))
        await conn.execute(text(
            "ALTER TABLE journeys ALTER COLUMN mode SET DEFAULT 'ASYNC'"
        ))
        # Lote 7: time_spent_seconds for responses
        await conn.execute(text(
            "ALTER TABLE question_responses ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER"
        ))
        # Lote 8: OCR batch import — participation_id nullable + import_report
        await conn.execute(text(
            "ALTER TABLE ocr_uploads ALTER COLUMN participation_id DROP NOT NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE ocr_uploads ADD COLUMN IF NOT EXISTS import_report JSONB"
        ))
        # Lote 9: Training final quiz — new columns on enrollments + drop module xp
        await conn.execute(text(
            "ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS quiz_unlocked_by UUID REFERENCES users(id)"
        ))
        await conn.execute(text(
            "ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS quiz_unlocked_at TIMESTAMP WITH TIME ZONE"
        ))
        await conn.execute(text(
            "ALTER TABLE training_modules DROP COLUMN IF EXISTS xp_reward"
        ))

    logger.info("Database tables created/verified.")


async def seed_admin():
    async with async_session() as db:
        result = await db.execute(select(User).where(User.role == UserRole.SUPER_ADMIN))
        if result.scalars().first():
            logger.info("Super admin already exists, skipping seed.")
            return

        # Use password from env var; fall back to a random password if not set
        password = settings.admin_seed_password
        if not password:
            password = secrets.token_urlsafe(20)
            logger.warning(
                "ADMIN_SEED_PASSWORD não configurada. Senha gerada aleatoriamente. "
                "Defina ADMIN_SEED_PASSWORD no .env para controlar a senha do admin."
            )

        admin = User(
            email="admin@gruppen.com.br",
            hashed_password=get_password_hash(password),
            full_name="Super Admin",
            role=UserRole.SUPER_ADMIN,
            department="TI",
        )
        db.add(admin)
        await db.commit()
        # Never log the actual password
        logger.info("Seeded super admin: admin@gruppen.com.br")


# ---------------------------------------------------------------------------
# Product seed data — sourced from https://www.gruppen.com.br/solucoes/
# ---------------------------------------------------------------------------
SEED_PRODUCTS = [
    # ── Ciber Segurança ──────────────────────────────────────────────
    {
        "name": "Firewall as a Service (MSS)",
        "description": (
            "Serviço gerenciado de firewall de nova geração. A Gruppen disponibiliza equipe "
            "especializada para monitoramento em tempo real, suporte integral do equipamento e "
            "atualização constante de políticas, regras e configurações de segurança. Modelo "
            "totalmente flexível e escalável, permitindo que o cliente adquira proteção de rede "
            "sem comprar equipamentos ou software, com implantação rápida e de baixo custo."
        ),
        "target_persona": "CTO, CISO, Gerente de TI, Diretor de Operações",
        "common_pain_points": (
            "Falta de equipe interna especializada em segurança de rede; "
            "alto custo de aquisição e manutenção de appliances; "
            "dificuldade em manter regras de firewall atualizadas; "
            "necessidade de monitoramento 24x7"
        ),
        "typical_objections": (
            "Já temos firewall interno; "
            "preocupação com latência ao terceirizar; "
            "receio de perder controle sobre políticas de segurança"
        ),
        "differentials": (
            "Equipe certificada Fortinet e Cisco; monitoramento 24x7; "
            "modelo OPEX sem investimento em hardware; "
            "flexibilidade e escalabilidade sob demanda; "
            "parceria com fabricantes líderes de mercado"
        ),
        "technology": "Fortinet FortiGate, Cisco Firepower",
    },
    {
        "name": "SIEM as a Service",
        "description": (
            "Serviço completo e ininterrupto que concentra, analisa e responde rapidamente a "
            "eventos e incidentes de segurança em tempo real. Com o SIEM, o cliente obtém visão "
            "profunda e em tempo real da segurança da empresa, permitindo extrair insights "
            "estratégicos e tomar decisões informadas para melhorar continuamente a proteção "
            "de informações sensíveis. Abordagem Zero Trust integrada."
        ),
        "target_persona": "CISO, Gerente de Segurança, Compliance Officer, CTO",
        "common_pain_points": (
            "Volume excessivo de logs sem correlação; "
            "incapacidade de detectar ameaças em tempo real; "
            "falta de visibilidade sobre eventos de segurança; "
            "requisitos de conformidade (LGPD, ISO 27001)"
        ),
        "typical_objections": (
            "Complexidade de implantação; "
            "custo elevado de licenciamento SIEM tradicional; "
            "já temos ferramentas de monitoramento"
        ),
        "differentials": (
            "Serviço gerenciado 24x7 com equipe especializada; "
            "correlação inteligente de eventos; "
            "abordagem Zero Trust integrada; "
            "relatórios estratégicos para tomada de decisão; "
            "conformidade com ISO 27001 e LGPD"
        ),
        "technology": "Fortinet FortiSIEM",
    },
    {
        "name": "Pentest (Teste de Intrusão)",
        "description": (
            "Serviço de teste de penetração conduzido por especialistas para identificar "
            "vulnerabilidades de segurança em redes, aplicações e infraestrutura. Simulação "
            "controlada de ataques cibernéticos reais para antecipar ações de cibercriminosos "
            "e fortalecer as defesas do ambiente corporativo."
        ),
        "target_persona": "CISO, CTO, Gerente de Segurança, Compliance Officer",
        "common_pain_points": (
            "Desconhecimento das vulnerabilidades reais do ambiente; "
            "necessidade de atender auditorias e compliance; "
            "risco de invasão e vazamento de dados; "
            "falta de equipe interna para testes ofensivos"
        ),
        "typical_objections": (
            "Risco de impacto no ambiente produtivo; "
            "já fizemos pentest uma vez; "
            "custo do serviço"
        ),
        "differentials": (
            "Equipe altamente especializada em segurança ofensiva; "
            "metodologia alinhada a padrões internacionais (OWASP, PTES); "
            "relatórios detalhados com plano de remediação priorizado; "
            "testes em redes, aplicações web, mobile e infraestrutura"
        ),
        "technology": "Kali Linux, Burp Suite, Nmap, Metasploit",
    },
    {
        "name": "Gestão Inteligente de Vulnerabilidades",
        "description": (
            "Serviço contínuo de identificação, classificação e priorização de vulnerabilidades "
            "no ambiente de TI. Monitoramento constante para garantir que novas ameaças sejam "
            "rapidamente detectadas e tratadas antes de serem exploradas."
        ),
        "target_persona": "CISO, Gerente de TI, Analista de Segurança",
        "common_pain_points": (
            "Ambiente com vulnerabilidades desconhecidas; "
            "falta de processo contínuo de gestão de vulnerabilidades; "
            "dificuldade em priorizar correções; "
            "requisitos regulatórios"
        ),
        "typical_objections": (
            "Já rodamos scans internamente; "
            "custo recorrente do serviço"
        ),
        "differentials": (
            "Monitoramento contínuo, não apenas pontual; "
            "priorização baseada em risco real do negócio; "
            "relatórios executivos e técnicos; "
            "integração com processos de patch management"
        ),
        "technology": "Tenable Nessus, Qualys",
    },
    {
        "name": "WAF (Web Application Firewall)",
        "description": (
            "Proteção especializada para aplicações web contra ataques como SQL Injection, "
            "Cross-Site Scripting (XSS), DDoS na camada de aplicação e outras ameaças do "
            "OWASP Top 10. Monitoramento e bloqueio de tráfego malicioso em tempo real."
        ),
        "target_persona": "CTO, Gerente de Desenvolvimento, CISO, DevOps Lead",
        "common_pain_points": (
            "Aplicações web expostas a ataques; "
            "incidentes de segurança em portais e APIs; "
            "requisitos de conformidade PCI-DSS; "
            "ataques DDoS na camada de aplicação"
        ),
        "typical_objections": (
            "Já temos firewall de rede; "
            "preocupação com falsos positivos; "
            "impacto na performance das aplicações"
        ),
        "differentials": (
            "Proteção específica para camada 7; "
            "regras customizadas por aplicação; "
            "integração com DevSecOps; "
            "monitoramento contínuo pela equipe Gruppen"
        ),
        "technology": "Fortinet FortiWeb, Cloudflare WAF",
    },
    {
        "name": "Antispam",
        "description": (
            "Solução de proteção de e-mail corporativo contra spam, phishing, malware e "
            "ameaças avançadas por e-mail. Filtragem inteligente que bloqueia mensagens "
            "maliciosas antes de chegarem ao usuário final."
        ),
        "target_persona": "Gerente de TI, CISO, Administrador de E-mail",
        "common_pain_points": (
            "Volume alto de spam e phishing; "
            "usuários caindo em golpes por e-mail; "
            "malware distribuído via anexos; "
            "perda de produtividade com lixo eletrônico"
        ),
        "typical_objections": (
            "O provedor de e-mail já tem filtro; "
            "custo adicional por caixa"
        ),
        "differentials": (
            "Camada adicional de proteção sobre Exchange/M365/Google; "
            "detecção avançada de phishing e BEC; "
            "quarentena gerenciada; "
            "relatórios de ameaças bloqueadas"
        ),
        "technology": "Trend Micro Email Security, Fortinet FortiMail",
    },
    {
        "name": "EPP/EDR (Endpoint Protection)",
        "description": (
            "Proteção avançada de endpoints combinando prevenção (EPP) com detecção e resposta "
            "(EDR). O EPP impede que ameaças entrem na rede, enquanto o EDR monitora "
            "continuamente o comportamento dos endpoints para identificar atividades suspeitas, "
            "gerar alertas em tempo real e facilitar investigação e resposta a incidentes."
        ),
        "target_persona": "CISO, Gerente de TI, Analista de Segurança",
        "common_pain_points": (
            "Antivírus tradicional insuficiente; "
            "ameaças avançadas e ransomware; "
            "falta de visibilidade sobre comportamento dos endpoints; "
            "necessidade de resposta rápida a incidentes"
        ),
        "typical_objections": (
            "Já temos antivírus; "
            "complexidade de gestão; "
            "custo por endpoint"
        ),
        "differentials": (
            "Parceria com Trend Micro e VMware Carbon Black; "
            "proteção proativa com IA e machine learning; "
            "capacidade de investigação forense; "
            "gestão centralizada pela Gruppen"
        ),
        "technology": "Trend Micro Apex One, VMware Carbon Black",
    },
    {
        "name": "XDR (Extended Detection and Response)",
        "description": (
            "Detecção e resposta estendida que correlaciona dados de múltiplas camadas de "
            "segurança — endpoints, rede, e-mail e nuvem — para identificar e neutralizar "
            "ameaças complexas de forma automatizada e integrada."
        ),
        "target_persona": "CISO, Diretor de TI, Gerente de SOC",
        "common_pain_points": (
            "Ferramentas de segurança operando em silos; "
            "excesso de alertas sem correlação; "
            "tempo de resposta a incidentes elevado; "
            "ameaças que atravessam múltiplas camadas"
        ),
        "typical_objections": (
            "Já temos EDR e SIEM; "
            "complexidade de integração; "
            "custo da solução"
        ),
        "differentials": (
            "Visão unificada de ameaças cross-layer; "
            "correlação automática de eventos; "
            "resposta automatizada; "
            "redução de fadiga de alertas; "
            "gestão pela equipe especializada Gruppen"
        ),
        "technology": "Trend Micro Vision One",
    },
    {
        "name": "NAC (Network Access Control)",
        "description": (
            "Controle de acesso à rede que garante que apenas dispositivos autorizados e em "
            "conformidade com as políticas de segurança possam se conectar à infraestrutura "
            "corporativa. Visibilidade completa de todos os dispositivos na rede."
        ),
        "target_persona": "Gerente de TI, CISO, Administrador de Rede",
        "common_pain_points": (
            "Dispositivos não autorizados na rede; "
            "falta de visibilidade sobre o que está conectado; "
            "BYOD sem controle; "
            "risco de dispositivos IoT vulneráveis"
        ),
        "typical_objections": (
            "Complexidade de implantação; "
            "impacto na experiência do usuário; "
            "já controlamos por VLAN"
        ),
        "differentials": (
            "Inventário automático de dispositivos; "
            "políticas granulares por tipo de dispositivo e usuário; "
            "integração com Fortinet e Cisco; "
            "implantação assistida pela Gruppen"
        ),
        "technology": "Fortinet FortiNAC, Cisco ISE",
    },
    {
        "name": "Microsegmentação",
        "description": (
            "Técnica avançada de segurança de rede que divide o ambiente em segmentos menores "
            "e isolados, limitando o movimento lateral de ameaças dentro da infraestrutura. "
            "Componente essencial de uma estratégia Zero Trust."
        ),
        "target_persona": "CISO, Arquiteto de Segurança, Gerente de Infraestrutura",
        "common_pain_points": (
            "Ameaças se movem livremente dentro da rede interna; "
            "modelo de segurança baseado apenas no perímetro; "
            "requisitos de compliance Zero Trust; "
            "dificuldade em isolar workloads sensíveis"
        ),
        "typical_objections": (
            "Complexidade operacional; "
            "impacto na comunicação entre aplicações; "
            "já usamos VLANs"
        ),
        "differentials": (
            "Implementação com parceiros VMware NSX; "
            "política granular por workload; "
            "visibilidade completa de tráfego leste-oeste; "
            "alinhado à estratégia Zero Trust da Gruppen"
        ),
        "technology": "VMware NSX",
    },
    {
        "name": "PAM (Privileged Access Management)",
        "description": (
            "Gerenciamento de acessos privilegiados que controla, monitora e audita o uso de "
            "credenciais com privilégios elevados. Garante que apenas pessoas autorizadas "
            "acessem sistemas críticos, com rastreabilidade completa de ações."
        ),
        "target_persona": "CISO, Compliance Officer, Gerente de TI, Auditor",
        "common_pain_points": (
            "Credenciais privilegiadas compartilhadas; "
            "falta de rastreabilidade de acessos administrativos; "
            "risco de abuso de privilégios; "
            "requisitos de auditoria e LGPD"
        ),
        "typical_objections": (
            "Burocracia para acessar sistemas; "
            "custo da solução; "
            "resistência dos times técnicos"
        ),
        "differentials": (
            "Cofre de senhas com rotação automática; "
            "gravação de sessões administrativas; "
            "alertas de comportamento anômalo; "
            "atende requisitos LGPD, ISO 27001 e PCI-DSS"
        ),
        "technology": "CyberArk, senhasegura",
    },
    # ── Backup / Nuvem ───────────────────────────────────────────────
    {
        "name": "BaaS (Backup como Serviço)",
        "description": (
            "Serviço de Backup como Serviço que garante a proteção dos dados críticos em todos "
            "os momentos. O backup é realizado de forma automatizada e segura, garantindo a "
            "disponibilidade dos dados em caso de desastres. Oferece recuperação rápida (RTO "
            "otimizado), monitoramento contínuo para garantir integridade e segurança dos dados, "
            "e suporte com equipe especializada."
        ),
        "target_persona": "CTO, Gerente de TI, Diretor de Operações, DPO",
        "common_pain_points": (
            "Risco de perda de dados por falha ou desastre; "
            "backup manual e inconsistente; "
            "tempo de recuperação (RTO/RPO) inadequado; "
            "requisitos de LGPD para proteção de dados; "
            "alto custo de infraestrutura de backup própria"
        ),
        "typical_objections": (
            "Já fazemos backup internamente; "
            "preocupação com segurança dos dados na nuvem; "
            "custo mensal do serviço; "
            "velocidade de recuperação em caso de desastre"
        ),
        "differentials": (
            "Parceria com Veeam como carro-chefe; "
            "monitoramento contínuo 24x7; "
            "recuperação rápida comprovada; "
            "modelo OPEX previsível; "
            "equipe certificada em proteção de dados; "
            "conformidade com LGPD"
        ),
        "technology": "Veeam Backup & Replication",
    },
    {
        "name": "IaaS (Infraestrutura como Serviço)",
        "description": (
            "Infraestrutura de TI entregue como serviço na nuvem, incluindo servidores virtuais, "
            "armazenamento e rede. Permite que o cliente escale recursos sob demanda sem "
            "investir em hardware próprio, com gestão e monitoramento pela equipe Gruppen."
        ),
        "target_persona": "CTO, Gerente de Infraestrutura, Diretor de TI",
        "common_pain_points": (
            "Capacidade limitada de infraestrutura on-premises; "
            "alto investimento em hardware (CAPEX); "
            "dificuldade em escalar rapidamente; "
            "necessidade de modernizar datacenter"
        ),
        "typical_objections": (
            "Preocupação com performance; "
            "segurança dos dados na nuvem; "
            "dependência do fornecedor"
        ),
        "differentials": (
            "Equipe especializada em virtualização (VMware, Dell EMC); "
            "modelo OPEX flexível; "
            "escalabilidade sob demanda; "
            "integração com demais serviços Gruppen (firewall, backup)"
        ),
        "technology": "VMware vSphere, Dell EMC",
    },
    {
        "name": "SaaS (Software como Serviço)",
        "description": (
            "Entrega de aplicações de software como serviço na nuvem, com gestão completa da "
            "infraestrutura, atualizações e suporte. Soluções Microsoft 365, ambientes "
            "colaborativos e aplicações de produtividade com implantação e suporte Gruppen."
        ),
        "target_persona": "Gerente de TI, CTO, Diretor Administrativo",
        "common_pain_points": (
            "Gestão complexa de licenciamento de software; "
            "necessidade de modernizar ferramentas de colaboração; "
            "falta de suporte especializado para M365"
        ),
        "typical_objections": (
            "Já usamos M365; "
            "custo por usuário; "
            "curva de aprendizado"
        ),
        "differentials": (
            "Parceria Microsoft com equipe altamente certificada; "
            "implantação assistida e migração de dados; "
            "suporte contínuo e treinamento; "
            "integração com segurança (antispam, MFA, Conditional Access)"
        ),
        "technology": "Microsoft 365, Azure",
    },
    # ── Datacenter ───────────────────────────────────────────────────
    {
        "name": "Hiperconvergência",
        "description": (
            "Infraestrutura hiperconvergente (HCI) que combina computação, armazenamento e "
            "rede em um único sistema gerenciado por software. Simplifica a gestão do datacenter, "
            "reduz custos e permite escalabilidade linear com alto desempenho."
        ),
        "target_persona": "CTO, Gerente de Infraestrutura, Arquiteto de TI",
        "common_pain_points": (
            "Infraestrutura legada complexa e custosa; "
            "silos entre storage, compute e rede; "
            "dificuldade de escalar; "
            "alta dependência de hardware dedicado"
        ),
        "typical_objections": (
            "Investimento inicial; "
            "migração da infraestrutura atual; "
            "vendor lock-in"
        ),
        "differentials": (
            "Parceria com Dell EMC e VMware vSAN; "
            "equipe certificada para projeto e implantação; "
            "redução de TCO comprovada; "
            "sustentabilidade com menor consumo energético"
        ),
        "technology": "Dell EMC VxRail, VMware vSAN",
    },
    {
        "name": "Servidores e Storage",
        "description": (
            "Fornecimento, implantação e gestão de servidores corporativos e soluções de "
            "armazenamento de dados (storage) de alta performance. Projetos dimensionados "
            "para a necessidade de cada cliente com parceiros líderes de mercado."
        ),
        "target_persona": "Gerente de TI, Gerente de Infraestrutura, CTO",
        "common_pain_points": (
            "Servidores obsoletos e sem suporte; "
            "capacidade de armazenamento insuficiente; "
            "performance degradada; "
            "falta de redundância"
        ),
        "typical_objections": (
            "Alto investimento em hardware; "
            "preferência por nuvem pública; "
            "complexidade de migração"
        ),
        "differentials": (
            "Parceria Dell EMC e HPE; "
            "dimensionamento customizado; "
            "implantação e suporte contínuo; "
            "integração com soluções de backup e virtualização"
        ),
        "technology": "Dell EMC PowerEdge, Dell EMC PowerStore, HPE ProLiant",
    },
    # ── Networking ───────────────────────────────────────────────────
    {
        "name": "Switch e Infraestrutura de Rede",
        "description": (
            "Projeto, fornecimento e implantação de infraestrutura de rede corporativa "
            "com switches gerenciáveis de alta performance. Segmentação de rede, "
            "QoS e gestão centralizada para ambientes corporativos."
        ),
        "target_persona": "Gerente de TI, Administrador de Rede, CTO",
        "common_pain_points": (
            "Rede lenta e instável; "
            "switches antigos sem gerenciamento; "
            "falta de segmentação adequada; "
            "dificuldade em gerenciar a rede"
        ),
        "typical_objections": (
            "Custo de substituição dos switches; "
            "downtime durante migração"
        ),
        "differentials": (
            "Parceria Cisco; "
            "projeto customizado para cada ambiente; "
            "equipe com mais de 20 anos em networking; "
            "integração com NAC e firewall"
        ),
        "technology": "Cisco Catalyst, Cisco Meraki",
    },
    {
        "name": "Wireless Corporativo",
        "description": (
            "Projeto e implantação de redes sem fio corporativas de alto desempenho, "
            "cobrindo Wi-Fi 5, Wi-Fi 6, Wi-Fi 6E e Wi-Fi 7. Análise de cobertura (site survey), "
            "configuração de segurança e gestão centralizada."
        ),
        "target_persona": "Gerente de TI, Gerente de Facilities, CTO",
        "common_pain_points": (
            "Cobertura Wi-Fi insuficiente; "
            "performance ruim em áreas de alta densidade; "
            "rede wireless insegura; "
            "dispositivos IoT sem controle"
        ),
        "typical_objections": (
            "Investimento em access points; "
            "complexidade de implantação; "
            "interferência entre redes"
        ),
        "differentials": (
            "Site survey profissional; "
            "suporte a Wi-Fi 5/6/6E/7; "
            "integração com NAC e segurança; "
            "parceria Cisco e Fortinet"
        ),
        "technology": "Cisco Catalyst Wi-Fi 6/6E, Fortinet FortiAP",
    },
    {
        "name": "SD-WAN",
        "description": (
            "Rede WAN definida por software que otimiza a conectividade entre filiais, "
            "datacenters e nuvem. Reduz custos de links MPLS, melhora performance de "
            "aplicações e garante segurança integrada em toda a WAN corporativa."
        ),
        "target_persona": "CTO, Gerente de TI, Gerente de Infraestrutura",
        "common_pain_points": (
            "Alto custo de links MPLS; "
            "baixa performance de aplicações em nuvem via WAN tradicional; "
            "complexidade de gerenciar múltiplas filiais; "
            "falta de visibilidade do tráfego WAN"
        ),
        "typical_objections": (
            "Segurança ao usar internet pública; "
            "complexidade de migração; "
            "já temos MPLS funcionando"
        ),
        "differentials": (
            "Parceria Fortinet Secure SD-WAN; "
            "segurança integrada (NGFW + SD-WAN); "
            "redução de custos com links; "
            "gestão centralizada pela Gruppen"
        ),
        "technology": "Fortinet Secure SD-WAN",
    },
    {
        "name": "SDN (Software-Defined Networking)",
        "description": (
            "Rede definida por software que separa o plano de controle do plano de dados, "
            "permitindo gestão centralizada, automação e programabilidade da infraestrutura "
            "de rede. Agilidade e flexibilidade para ambientes corporativos modernos."
        ),
        "target_persona": "Arquiteto de Rede, CTO, Gerente de Infraestrutura",
        "common_pain_points": (
            "Gestão manual e demorada da rede; "
            "dificuldade em automatizar configurações; "
            "complexidade em ambientes multi-vendor; "
            "falta de agilidade para mudanças"
        ),
        "typical_objections": (
            "Complexidade de adoção; "
            "custo de transformação; "
            "equipe não está preparada"
        ),
        "differentials": (
            "Equipe especializada em automação de redes; "
            "parceria VMware NSX e Cisco ACI; "
            "integração com microsegmentação; "
            "redução de tempo de provisionamento"
        ),
        "technology": "VMware NSX, Cisco ACI",
    },
    # ── End User ─────────────────────────────────────────────────────
    {
        "name": "VDI (Virtual Desktop Infrastructure)",
        "description": (
            "Infraestrutura de desktops virtuais que permite acesso remoto seguro a ambientes "
            "de trabalho hospedados em servidores centralizados. Ideal para trabalho remoto, "
            "BYOD e ambientes que exigem alto controle de dados."
        ),
        "target_persona": "CTO, Gerente de TI, Gerente de RH, CISO",
        "common_pain_points": (
            "Necessidade de trabalho remoto seguro; "
            "custo de estações de trabalho individuais; "
            "falta de controle sobre dados em dispositivos pessoais; "
            "complexidade de gestão de desktops distribuídos"
        ),
        "typical_objections": (
            "Experiência do usuário inferior; "
            "investimento em infraestrutura de servidores; "
            "dependência de rede"
        ),
        "differentials": (
            "Especialista em VMware Horizon; "
            "integração com segurança (EPP/EDR, NAC); "
            "escalável e centralizado; "
            "redução de TCO para estações de trabalho"
        ),
        "technology": "VMware Horizon",
    },
    {
        "name": "Estações de Trabalho",
        "description": (
            "Fornecimento e gestão de estações de trabalho corporativas com configuração "
            "padronizada, segurança embarcada e suporte contínuo. Notebooks, desktops e "
            "thin clients dimensionados para cada perfil de usuário."
        ),
        "target_persona": "Gerente de TI, Gerente de Compras, Diretor Administrativo",
        "common_pain_points": (
            "Parque de máquinas desatualizado; "
            "falta de padronização; "
            "dificuldade de gestão remota; "
            "vulnerabilidades em endpoints desatualizados"
        ),
        "typical_objections": (
            "Preferimos comprar direto; "
            "custo por equipamento"
        ),
        "differentials": (
            "Parceria Dell e HPE; "
            "configuração e hardening pré-instalado; "
            "gestão de ciclo de vida; "
            "integração com EPP/EDR e VDI"
        ),
        "technology": "Dell Latitude, Dell OptiPlex, HPE",
    },
    # ── Serviços ─────────────────────────────────────────────────────
    {
        "name": "Gestão de Risco e Suporte Técnico",
        "description": (
            "Serviço continuado que combina gestão de riscos de TI com suporte técnico "
            "especializado. O cliente conta com toda a experiência e especialização da equipe "
            "Gruppen para conduzir seus principais desafios e demandas relacionadas a "
            "infraestrutura e segurança da informação. Possibilidade de agregar outras "
            "ofertas do portfólio para elevar o valor agregado."
        ),
        "target_persona": "CTO, Gerente de TI, Diretor de Operações, CISO",
        "common_pain_points": (
            "Equipe interna sobrecarregada; "
            "falta de especialistas em segurança; "
            "incidentes recorrentes sem análise de causa raiz; "
            "necessidade de governança de TI"
        ),
        "typical_objections": (
            "Já temos equipe interna; "
            "custo mensal do serviço; "
            "receio de terceirizar operações críticas"
        ),
        "differentials": (
            "Equipe multidisciplinar certificada; "
            "modelo flexível e escalável; "
            "integração com todo o portfólio Gruppen; "
            "parcerias VMware, Dell EMC, Microsoft, Fortinet, Cisco; "
            "foco em melhoria contínua e transferência de conhecimento"
        ),
        "technology": "Multi-vendor (VMware, Dell EMC, Microsoft, Fortinet, Cisco)",
    },
]


async def seed_products():
    """Pre-register Gruppen solutions from gruppen.com.br/solucoes/."""
    async with async_session() as db:
        result = await db.execute(select(Product).limit(1))
        if result.scalars().first():
            logger.info("Products already seeded, skipping.")
            return

        for idx, data in enumerate(SEED_PRODUCTS):
            product = Product(**data, priority=idx)
            db.add(product)

        await db.commit()
        logger.info("Seeded %d products from gruppen.com.br/solucoes/", len(SEED_PRODUCTS))


async def startup():
    await init_db()
    await seed_admin()
    await seed_products()


if __name__ == "__main__":
    asyncio.run(startup())
