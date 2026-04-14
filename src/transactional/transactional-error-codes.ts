/**
 * Mapeamento de códigos de status/erro da API de Transactional Messaging do SFMC
 * para descrições e sugestões de resolução em português.
 */

export interface TransactionalErrorInfo {
  description: string;
  suggestion: string;
}

export const TRANSACTIONAL_STATUS_CODES: Record<number, TransactionalErrorInfo> = {
  0: {
    description: 'Sucesso — mensagem aceita para processamento.',
    suggestion: 'Nenhuma ação necessária.',
  },
  1: {
    description: 'Mensagem não enviada (erro genérico).',
    suggestion: 'Verifique os dados do destinatário e a definição.',
  },
  2: {
    description: 'Mensagem na fila para retry.',
    suggestion: 'Aguarde e verifique o status novamente.',
  },
  5: {
    description: 'Definição inativa ou não encontrada.',
    suggestion: 'Verifique se a definition está com status "Active" no SFMC.',
  },
  6: {
    description: 'Erro de autenticação ou permissão.',
    suggestion: 'Verifique as credenciais e se o pacote instalado tem permissão para envio transacional.',
  },
  10: {
    description: 'Destinatário inválido ou sem e-mail.',
    suggestion: 'Verifique o campo "to" e o "contactKey" do destinatário.',
  },
  14: {
    description: 'Endereço de e-mail inválido.',
    suggestion: 'Confira o formato do endereço de e-mail (deve ser válido).',
  },
  19: {
    description: 'Campos obrigatórios ausentes nos atributos.',
    suggestion:
      'Use txn_inspect_email_definition para ver os campos exigidos pela DE. ' +
      'Verifique se os nomes dos atributos correspondem exatamente (case-sensitive) ' +
      'aos nomes dos campos na Data Extension (geralmente lowercase).',
  },
  23: {
    description: 'Subscriber descadastrado (opted-out).',
    suggestion: 'O contato solicitou descadastro. Use uma lista ou DE diferente se for teste.',
  },
  24: {
    description: 'Subscriber na lista de supressão.',
    suggestion: 'O contato está suprimido. Verifique a configuração de supressão da definição.',
  },
  100: {
    description: 'Mensagem enviada com sucesso.',
    suggestion: 'Nenhuma ação necessária.',
  },
  103: {
    description: 'Erro na construção da mensagem (MessageBuildError).',
    suggestion:
      'O SFMC falhou ao montar o HTML do e-mail. Causas comuns: ' +
      '(1) campos JSON ausentes no atributo "json" — use txn_inspect_email_definition para ver o schema completo; ' +
      '(2) campos de objeto-raiz ausentes (ex: shoppingCart.shoppingCartId, totalPrice, deliveryPrice, priceSaved); ' +
      '(3) link tracking falhou em alguma URL do template; ' +
      '(4) %%view_email_url%% ou %%unsub_center_url%% não resolúveis neste contexto.',
  },
  105: {
    description: 'Content Builder asset não encontrado.',
    suggestion: 'Verifique se o asset vinculado à definition existe e está publicado no Content Builder.',
  },
  106: {
    description: 'Data Extension não encontrada.',
    suggestion: 'Verifique se a DE em subscriptions.dataExtension existe e está acessível nesta BU.',
  },
  108: {
    description: 'Subscriber não encontrado e autoAddSubscriber está desabilitado.',
    suggestion: 'Habilite autoAddSubscriber na definição ou garanta que o contactKey exista no All Subscribers.',
  },
  111: {
    description: 'Erro de script AMPscript — RaiseError() foi acionado no template.',
    suggestion:
      'O template contém guards de validação via RaiseError(). Causas comuns: ' +
      '(1) seção obrigatória ausente no JSON (ex: shoppingCart, payments, products); ' +
      '(2) array vazio onde se espera pelo menos 1 item. ' +
      'Use txn_inspect_email_definition para ver os guards identificados (raisedErrors).',
  },
  113: {
    description: 'Timeout na construção da mensagem.',
    suggestion: 'O template é muito pesado ou tem loop muito longo. Tente simplificar o payload JSON.',
  },
};

/** Retorna a descrição e sugestão para um código de status transacional. */
export function getTransactionalStatusInfo(code: number): TransactionalErrorInfo {
  return (
    TRANSACTIONAL_STATUS_CODES[code] ?? {
      description: `Código de status desconhecido: ${code}`,
      suggestion: 'Consulte a documentação da API de Transactional Messaging do SFMC.',
    }
  );
}

/** Enriquece um objeto de resposta/status com descrição legível quando há um campo statusCode. */
export function enrichWithStatusDescription<T extends Record<string, unknown>>(response: T): T & {
  statusDescription?: string;
  statusSuggestion?: string;
} {
  const code = response['statusCode'] as number | undefined;
  if (code === undefined || code === null) return response;

  const info = getTransactionalStatusInfo(code);
  return {
    ...response,
    statusDescription: info.description,
    statusSuggestion: info.suggestion,
  };
}
